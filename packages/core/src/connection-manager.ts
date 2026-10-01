import { HubConnectionBuilder, HubConnectionState } from "@microsoft/signalr";
import { assertProtocolFitsTransport, isRetriableConnectError, joinHubUrl } from "./config.js";
import type { HubConnection } from "@microsoft/signalr";
import type { HubEntry } from "./hub-entry.js";
import type {
  HubConnectionStatus,
  SignalRErrorInfo,
  HubString,
  ResolvedHubConfig,
} from "./types.js";

const RECOVER_DELAY_STEP_MS = 2500;
const RECOVER_DELAY_MAX_MS = 30000;

function noop() {}

/** SignalR passes no error on a clean close, and after it gave up its auto-reconnect. */
function cleanCloseError(afterReconnectAttempts: boolean): Error {
  return new Error(
    afterReconnectAttempts
      ? "Reconnect retries exhausted"
      : "The server or a proxy closed the connection.",
  );
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as { then?: unknown } | null)?.then === "function";
}

/** Runs a user callback. A throw or a rejection goes to onError. A failure of onError is dropped. */
export function runUserCallback<Hub extends HubString>(
  hub: Hub,
  callback: () => unknown,
  onError: (hub: Hub, error: unknown) => unknown,
): void {
  const report = (err: unknown) => {
    try {
      const result = onError(hub, err);
      if (isThenable(result)) result.then(undefined, noop);
    } catch {
      // Nothing is left to report to.
    }
  };
  try {
    const result = callback();
    if (isThenable(result)) result.then(undefined, report);
  } catch (err) {
    report(err);
  }
}

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
  /** Hubs that connected before, shared across rebuilds. A later connect of one runs the reconnect listeners. */
  connectedBefore: Set<Hub>;
  /** Delivers a server push to the session's handler registry. */
  dispatch: (hub: Hub, event: string, args: unknown[]) => void;
  /** `error` is set when the status is "disconnected" after a failure. */
  onStatus: (hub: Hub, status: HubConnectionStatus, error?: unknown) => void;
  /** Reports once per outage: the first failed attempt of a retriable outage, or a non-retriable error. */
  onError: (hub: Hub, error: unknown, info: SignalRErrorInfo) => void;
  /** True while this manager's generation is the live one. Guards stale rebuilds. */
  isCurrent: () => boolean;
}

export interface ConnectionManager<Hub extends HubString> {
  /** Builds/starts desired hubs and stops undesired ones. Safe to call repeatedly. */
  reconcile: () => void;
  getConnection: (hub: Hub) => HubConnection | null;
  /** Stops all connections and cancels timers. */
  dispose: () => void;
}

/** Owns the hub connections of one provider generation: build, start with recovery, lazy ref-counted stop. */
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
    connectedBefore,
    dispatch,
    onStatus,
    isCurrent,
  } = deps;
  const report = (hub: Hub, error: unknown, source: SignalRErrorInfo["source"]) =>
    runUserCallback(hub, () => deps.onError(hub, error, { source }), noop);
  const onError = (hub: Hub, error: unknown) => report(hub, error, "connection");
  const onCallbackError = (hub: Hub, error: unknown) => report(hub, error, "callback");

  const built = new Map<Hub, HubEntry>();
  const recoverTimers = new Map<Hub, ReturnType<typeof setTimeout>>();
  const attempts = new Map<Hub, number>();
  const misconfigured = new Set<Hub>();
  let disposing = false;

  const setStatus = (hub: Hub, status: HubConnectionStatus, error?: unknown) => {
    runUserCallback(hub, () => onStatus(hub, status, error), onCallbackError);
  };

  // Fire-and-forget keeps the API synchronous. A rejection still reaches onError.
  const stopConnection = (hub: Hub, connection: HubConnection) => {
    void connection.stop().catch((err: unknown) => onError(hub, err));
  };

  const clearStopTimer = (hub: Hub) => {
    const id = stopTimers.get(hub);
    if (id !== undefined) {
      clearTimeout(id);
      stopTimers.delete(hub);
    }
  };

  const clearRecoverTimer = (hub: Hub) => {
    const id = recoverTimers.get(hub);
    if (id !== undefined) {
      clearTimeout(id);
      recoverTimers.delete(hub);
    }
    attempts.delete(hub);
  };

  const applyReconnect = (
    builder: HubConnectionBuilder,
    reconnect: ResolvedHubConfig["reconnect"],
  ) => {
    if (reconnect === true) builder.withAutomaticReconnect();
    else if (Array.isArray(reconnect)) builder.withAutomaticReconnect(reconnect);
    else if (reconnect !== false) builder.withAutomaticReconnect(reconnect);
  };

  const buildConnection = (hub: Hub, rc: ResolvedHubConfig): HubConnection => {
    const protocol = typeof rc.hubProtocol === "function" ? rc.hubProtocol() : rc.hubProtocol;
    if (protocol) assertProtocolFitsTransport(hub, protocol, rc.httpOptions);

    let builder = new HubConnectionBuilder().withUrl(joinHubUrl(baseUrl, hub), {
      ...rc.httpOptions,
      accessTokenFactory: () => Promise.resolve(getAccessToken()),
    });
    if (protocol) builder = builder.withHubProtocol(protocol);
    builder = builder.configureLogging(rc.logLevel);
    applyReconnect(builder, rc.reconnect);
    for (const configure of rc.configureBuilders) builder = configure(builder, { hub, baseUrl });
    return builder.build();
  };

  const runReconnectListeners = (hub: Hub) => {
    [...(reconnectListeners.get(hub) ?? [])].forEach((cb) =>
      runUserCallback(hub, cb, onCallbackError),
    );
  };

  const buildAndStart = (hub: Hub) => {
    if (disposing || built.has(hub) || misconfigured.has(hub)) return;
    clearStopTimer(hub);
    const rc = resolve(hub);

    let conn: HubConnection;
    try {
      conn = buildConnection(hub, rc);
    } catch (err) {
      // A build error comes from the app config, so a retry cannot fix it.
      attempts.delete(hub);
      misconfigured.add(hub);
      setStatus(hub, "disconnected", err);
      onError(hub, err);
      return;
    }

    const entry: HubEntry = { connection: conn, stopping: false, reconnecting: false };
    built.set(hub, entry);

    // Bind before start() so early pushes arrive.
    for (const ev of rc.events) {
      conn.on(ev, (...args: unknown[]) => {
        if (!isCurrent() || built.get(hub) !== entry) return;
        dispatch(hub, ev, args);
      });
    }

    const fail = (err: unknown, republishStatus: boolean) => {
      if (built.get(hub) !== entry) return;
      if (!isRetriableConnectError(err)) {
        attempts.delete(hub);
        setStatus(hub, "disconnected", err);
        onError(hub, err);
        return;
      }
      built.delete(hub);
      if (!desired().has(hub)) {
        attempts.delete(hub);
        connectedBefore.delete(hub);
        setStatus(hub, "idle");
        return;
      }
      const attempt = (attempts.get(hub) ?? 0) + 1;
      attempts.set(hub, attempt);
      if (attempt === 1) onError(hub, err);
      if (republishStatus) setStatus(hub, "connecting");
      const delay = Math.min(RECOVER_DELAY_STEP_MS * attempt, RECOVER_DELAY_MAX_MS);
      const id = setTimeout(() => {
        recoverTimers.delete(hub);
        if (!isCurrent() || !desired().has(hub)) return;
        buildAndStart(hub);
      }, delay);
      recoverTimers.set(hub, id);
    };

    // SignalR has no removal API, so attach lifecycle handlers once.
    conn.onclose((err) => {
      // A stale generation's late callback must never overwrite the live one's status.
      if (!isCurrent() || built.get(hub) !== entry) return;
      if (disposing) return;
      fail(err ?? cleanCloseError(entry.reconnecting), true);
    });
    conn.onreconnecting(() => {
      if (!isCurrent() || built.get(hub) !== entry) return;
      entry.reconnecting = true;
      setStatus(hub, "reconnecting");
    });
    conn.onreconnected(() => {
      if (!isCurrent() || built.get(hub) !== entry) return;
      entry.reconnecting = false;
      setStatus(hub, "connected");
      if (disposing) return;
      runReconnectListeners(hub);
    });

    const start = async () => {
      if (conn.state !== HubConnectionState.Disconnected) return;
      if (disposing || entry.stopping) return;
      try {
        await conn.start();
      } catch (err) {
        if (disposing || entry.stopping || !isCurrent()) return;
        fail(err, false);
        return;
      }
      if (disposing || entry.stopping) return;
      attempts.delete(hub);
      const recovered = connectedBefore.has(hub);
      connectedBefore.add(hub);
      setStatus(hub, "connected");
      if (recovered && !disposing) runReconnectListeners(hub);
    };
    if (!attempts.has(hub)) setStatus(hub, "connecting");
    void start();
  };

  const scheduleStop = (hub: Hub) => {
    const entry = built.get(hub);
    if (!entry) return;
    const { graceMs } = resolve(hub);
    clearStopTimer(hub);
    const stopNow = () => {
      if (disposing) return;
      stopTimers.delete(hub);
      if ((refCounts.get(hub) ?? 0) > 0) return; // re-acquired during the grace period
      const e = built.get(hub);
      if (!e || e.stopping) return;
      e.stopping = true;
      built.delete(hub);
      attempts.delete(hub);
      connectedBefore.delete(hub);
      setStatus(hub, "idle");
      stopConnection(hub, e.connection);
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
    for (const hub of want) {
      if (!built.has(hub) && !recoverTimers.has(hub)) buildAndStart(hub);
    }
    for (const hub of built.keys()) if (!want.has(hub)) scheduleStop(hub);
    for (const hub of [...misconfigured]) {
      if (want.has(hub)) continue;
      misconfigured.delete(hub);
      connectedBefore.delete(hub);
      setStatus(hub, "idle");
    }
    for (const hub of [...recoverTimers.keys()]) {
      if (want.has(hub)) continue;
      clearRecoverTimer(hub);
      connectedBefore.delete(hub);
      setStatus(hub, "idle");
    }
  };

  const getConnection = (hub: Hub) => built.get(hub)?.connection ?? null;

  const dispose = () => {
    disposing = true;
    stopTimers.forEach((id) => clearTimeout(id));
    stopTimers.clear();
    recoverTimers.forEach((id) => clearTimeout(id));
    recoverTimers.clear();
    attempts.clear();
    misconfigured.clear();
    built.forEach((e, hub) => stopConnection(hub, e.connection));
    // refCounts are kept across rebuilds on purpose.
  };

  return { reconcile, getConnection, dispose };
}
