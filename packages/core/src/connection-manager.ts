import { HubConnectionBuilder, HubConnectionState } from "@microsoft/signalr";
import { isRetriableConnectError } from "./config.js";
import type { HubConnection } from "@microsoft/signalr";
import type { HubEntry } from "./hub-entry.js";
import type {
  HubConnectionStatus,
  HubString,
  ResolvedHubConfig,
} from "./types.js";

const CONNECT_RETRY_BASE_MS = 2500;

function noop() {}

export interface ConnectionManagerDeps<Hub extends HubString> {
  baseUrl: string;
  hubs: Hub[];
  resolve: (hub: Hub) => ResolvedHubConfig;
  /** Read fresh on every (re)negotiate, so token rotation needs no rebuild. */
  getAccessToken: () => string | Promise<string>;
  /** Per-hub ref-counts, shared across rebuilds, for the lazy lifecycle. */
  refCounts: Map<Hub, number>;
  /** Pending lazy-stop timers, shared across rebuilds. */
  stopTimers: Map<Hub, ReturnType<typeof setTimeout>>;
  reconnectListeners: Map<Hub, Set<() => void>>;
  onStatus: (hub: Hub, status: HubConnectionStatus) => void;
  onError: (hub: Hub, error: unknown) => void;
  /** True while this manager's generation is the live one. Guards stale rebuilds. */
  isCurrent: () => boolean;
}

export interface ConnectionManager<Hub extends HubString> {
  /** Builds/starts desired hubs and stops undesired ones. Safe to call repeatedly. */
  reconcile: () => void;
  getConnection: (hub: Hub) => HubConnection | null;
  /** Resolves once the hub is connected. Rejects after timeoutMs otherwise. */
  waitForConnection: (hub: Hub, timeoutMs: number) => Promise<HubConnection>;
  /** Stops all connections and cancels timers. */
  dispose: () => void;
}

/**
 * Owns the HubConnection lifecycle for one provider generation: building,
 * starting with retry, lazy ref-counted start/stop, and reconnect fan-out.
 * Framework-neutral — driven by the adapter's lifecycle hook and context callbacks.
 */
export function createConnectionManager<Hub extends HubString>(
  deps: ConnectionManagerDeps<Hub>,
): ConnectionManager<Hub> {
  const {
    baseUrl,
    hubs,
    resolve,
    getAccessToken,
    refCounts,
    stopTimers,
    reconnectListeners,
    onStatus,
    onError,
    isCurrent,
  } = deps;

  const built = new Map<Hub, HubEntry>();
  let disposing = false;

  const setStatus = (hub: Hub, status: HubConnectionStatus) => {
    const e = built.get(hub);
    if (e) e.status = status;
    onStatus(hub, status);
  };

  const clearStopTimer = (hub: Hub) => {
    const id = stopTimers.get(hub);
    if (id !== undefined) {
      clearTimeout(id);
      stopTimers.delete(hub);
    }
  };

  const applyReconnect = (
    builder: HubConnectionBuilder,
    reconnect: ResolvedHubConfig["reconnect"],
  ) => {
    if (reconnect === true) builder.withAutomaticReconnect();
    else if (Array.isArray(reconnect)) builder.withAutomaticReconnect(reconnect);
    else if (reconnect !== false) builder.withAutomaticReconnect(reconnect);
  };

  const buildAndStart = (hub: Hub) => {
    if (disposing || built.has(hub)) return;
    clearStopTimer(hub);
    const rc = resolve(hub);

    const builder = new HubConnectionBuilder()
      .withUrl(`${baseUrl}${hub}`, {
        accessTokenFactory: () => Promise.resolve(getAccessToken()),
        transport: rc.transport,
        skipNegotiation: rc.skipNegotiation,
      })
      .configureLogging(rc.logLevel);
    applyReconnect(builder, rc.reconnect);
    const conn = builder.build();

    // Pre-bind declared client events, so a server push never hits zero handlers.
    for (const ev of rc.events) conn.on(ev, noop);

    let resolveReady!: () => void;
    const ready = new Promise<void>((res) => {
      resolveReady = res;
    });
    const entry: HubEntry = {
      connection: conn,
      status: "connecting",
      ready,
      resolveReady,
      stopping: false,
    };
    built.set(hub, entry);

    // Attach lifecycle handlers ONCE — SignalR has no removal API.
    conn.onclose((err) => {
      // A deliberate stop() (logout, rebuild, lazy stop) leaves err undefined: stay silent.
      if (disposing || err === undefined) {
        setStatus(hub, "disconnected");
        return;
      }
      setStatus(hub, "disconnected");
      onError(hub, err);
    });
    conn.onreconnecting(() => setStatus(hub, "reconnecting"));
    conn.onreconnected(() => {
      entry.resolveReady();
      if (!disposing && isCurrent()) {
        onStatus(hub, "reconnected");
        reconnectListeners.get(hub)?.forEach((cb) => cb());
      }
      setStatus(hub, "connected");
    });

    let retries = 0;
    const start = async () => {
      if (disposing || entry.stopping) return;
      if (conn.state !== HubConnectionState.Disconnected) return;
      try {
        await conn.start();
        if (disposing || entry.stopping) return;
        entry.resolveReady();
        setStatus(hub, "connected");
      } catch (err) {
        if (disposing || entry.stopping) return;
        if (!isRetriableConnectError(err) || retries >= rc.maxConnectRetries) {
          setStatus(hub, "disconnected");
          onError(hub, err);
          return;
        }
        retries += 1;
        setStatus(hub, "disconnected");
        setTimeout(start, CONNECT_RETRY_BASE_MS * retries);
      }
    };
    void start();
  };

  const scheduleStop = (hub: Hub) => {
    const entry = built.get(hub);
    if (!entry) return;
    const { graceMs } = resolve(hub);
    clearStopTimer(hub);
    const stopNow = () => {
      stopTimers.delete(hub);
      if ((refCounts.get(hub) ?? 0) > 0) return; // re-acquired during the grace period
      const e = built.get(hub);
      if (!e || e.stopping) return;
      e.stopping = true;
      built.delete(hub);
      setStatus(hub, "disconnected");
      void e.connection.stop();
    };
    if (graceMs <= 0) queueMicrotask(stopNow);
    else stopTimers.set(hub, setTimeout(stopNow, graceMs));
  };

  const desired = (): Set<Hub> => {
    const out = new Set<Hub>();
    for (const hub of hubs) {
      const rc = resolve(hub);
      if (!rc.lazy) out.add(hub);
      else if ((refCounts.get(hub) ?? 0) > 0) out.add(hub);
    }
    return out;
  };

  const reconcile = () => {
    if (disposing) return;
    const want = desired();
    for (const hub of want) if (!built.has(hub)) buildAndStart(hub);
    for (const hub of built.keys()) if (!want.has(hub)) scheduleStop(hub);
  };

  const getConnection = (hub: Hub) => built.get(hub)?.connection ?? null;

  const waitForConnection = async (hub: Hub, timeoutMs: number) => {
    const sync = built.get(hub);
    if (sync && sync.connection.state === HubConnectionState.Connected) {
      return sync.connection;
    }
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const entry = built.get(hub);
      if (entry?.connection.state === HubConnectionState.Connected) {
        return entry.connection;
      }
      const timeout = new Promise<"timeout">((res) =>
        setTimeout(() => res("timeout"), deadline - Date.now()),
      );
      const result = await Promise.race([
        entry?.ready.then(() => "ready" as const) ?? timeout,
        timeout,
      ]);
      if (result === "timeout") break;
    }
    throw new Error(
      `Timeout waiting for SignalR connection to ${hub} (${timeoutMs}ms)`,
    );
  };

  const dispose = () => {
    disposing = true;
    stopTimers.forEach((id) => clearTimeout(id));
    stopTimers.clear();
    built.forEach((e) => void e.connection.stop());
    // refCounts are kept across rebuilds on purpose.
  };

  return { reconcile, getConnection, waitForConnection, dispose };
}
