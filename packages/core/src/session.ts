import { HubConnectionState } from "@microsoft/signalr";
import { createConnectionManager, runUserCallback } from "./connection-manager.js";
import { SIGNALR_ERROR_NAMES, namedError } from "./errors.js";
import type { HubConnection } from "@microsoft/signalr";
import type { ConnectionManager } from "./connection-manager.js";
import type { StatusStore } from "./status-store.js";
import type {
  HubConnectionStatus,
  HubString,
  ResolvedHubConfig,
  SignalRContract,
  SignalRErrorInfo,
} from "./types.js";
import type { SignalRContextValueBase, SignalRPublicContext } from "./context.js";

const MAX_TIMER_MS = 2 ** 31 - 1;

export interface SignalRSessionDeps<
  T extends SignalRContract,
  TStore extends StatusStore<keyof T & HubString> = StatusStore<keyof T & HubString>,
> {
  /**
   * The hub paths that the session manages.
   * @remarks `Array<keyof T & HubString>`
   */
  hubs: Array<keyof T & HubString>;
  /** Returns the resolved config of one hub, the result of `resolveHubConfig`. */
  resolve: (hub: keyof T & HubString) => ResolvedHubConfig;
  /** The store that receives every status change. */
  statusStore: TStore;
  /** Read on every negotiate and every auto-reconnect attempt, so a token change needs no rebuild. */
  getAccessToken: () => string | Promise<string>;
  /** Called after the store changes. */
  onStatusChange?: (hub: keyof T & HubString, status: HubConnectionStatus) => void;
  /** Called for connection errors and for errors that user callbacks throw. */
  onError?: (hub: keyof T & HubString, error: unknown, info: SignalRErrorInfo) => void;
}

/** The values that a provider applies. */
export interface SignalRSessionValues {
  /** The base URL of the server. An empty value disables the session. */
  baseUrl?: string;
  /**
   * When `false`, the session stops and every hub is `idle`.
   * @default true
   */
  enabled?: boolean;
  /** A different value rebuilds the connections. */
  connectionKey?: string | number;
}

export interface SignalRSession<
  T extends SignalRContract,
  TStore extends StatusStore<keyof T & HubString> = StatusStore<keyof T & HubString>,
> {
  /** Disposes the live generation, sets every hub to `"idle"`, and forgets which hubs connected before. Calling it again does nothing. */
  stop: () => void;
  /** Does nothing if the values equal the last applied values. Otherwise it disposes the live generation and, if `enabled` is true and `baseUrl` is not empty, builds a new one. A rebuild keeps which hubs connected, so their reconnect callbacks run. */
  update: (values: SignalRSessionValues) => void;
  /** The value that an adapter puts into its framework context. Its identity is stable. */
  context: SignalRContextValueBase<T, TStore>;
  /** The frozen object with `getConnection`, `getStatus`, and `waitForConnection`. Its identity is stable. */
  publicContext: SignalRPublicContext<T>;
}

/** Owns the manager generation, lazy ref-counts, reconnect listeners, and the context value. Adapters add only framework binding. */
export function createSignalRSession<
  T extends SignalRContract,
  TStore extends StatusStore<keyof T & HubString> = StatusStore<keyof T & HubString>,
>(deps: SignalRSessionDeps<T, TStore>): SignalRSession<T, TStore> {
  type Hub = keyof T & HubString;
  type EventHandler = (...args: unknown[]) => void;
  type Waiter = { resolve: (connection: HubConnection) => void; reject: (error: Error) => void };
  const { hubs, resolve, statusStore, getAccessToken, onStatusChange, onError } = deps;
  const reportCallbackError = (hub: Hub, err: unknown) =>
    onError?.(hub, err, { source: "callback" });

  // Lazy ref-counts, stop timers, reconnect listeners, connect history, and event handlers persist
  // across rebuilds. The live manager is swapped per generation.
  const refCounts = new Map<Hub, number>();
  const stopTimers = new Map<Hub, ReturnType<typeof setTimeout>>();
  const reconnectListeners = new Map<Hub, Set<() => void>>();
  const connectedBefore = new Set<Hub>();
  const handlers = new Map<Hub, Map<string, Set<EventHandler>>>();
  const waiters = new Map<Hub, Set<Waiter>>();
  // Hubs that stopped after a non-retriable error, with the error. A wait on one can never succeed.
  const failed = new Map<Hub, Error>();
  let disabled = false;
  let current: ConnectionManager<Hub> | null = null;
  let applied: SignalRSessionValues | null = null;

  const dispatch = (hub: Hub, event: string, args: unknown[]) => {
    const set = handlers.get(hub)?.get(event);
    if (!set) return;
    [...set].forEach((handler) =>
      runUserCallback(hub, () => handler(...args), reportCallbackError),
    );
  };

  const flushWaiters = (hub: Hub) => {
    const connection = current?.getConnection(hub);
    const set = waiters.get(hub);
    if (!connection || !set) return;
    [...set].forEach((waiter) => waiter.resolve(connection));
  };

  const rejectWaiters = (hub: Hub, error: Error) => {
    const set = waiters.get(hub);
    if (set) [...set].forEach((waiter) => waiter.reject(error));
  };

  const disabledError = (hub: Hub) => namedError(SIGNALR_ERROR_NAMES.disabled, `SignalR is disabled: ${hub}`);

  const failHub = (hub: Hub, cause: unknown) => {
    const reason = cause instanceof Error ? cause.message : String(cause);
    const error = namedError(SIGNALR_ERROR_NAMES.disconnected, `SignalR hub ${hub} is disconnected: ${reason}`);
    failed.set(hub, error);
    rejectWaiters(hub, error);
  };

  const waitForConnection = (hub: Hub, timeoutMs: number, signal?: AbortSignal) =>
    new Promise<HubConnection>((resolvePromise, reject) => {
      if (signal?.aborted) return reject(signal.reason);
      const live = current?.getConnection(hub);
      if (live?.state === HubConnectionState.Connected) return resolvePromise(live);
      if (disabled) return reject(disabledError(hub));
      const failure = failed.get(hub);
      if (failure) return reject(failure);

      let set = waiters.get(hub);
      if (!set) waiters.set(hub, (set = new Set()));
      const settle = () => {
        if (timer !== undefined) clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        set.delete(waiter);
      };
      const waiter: Waiter = {
        resolve: (connection) => {
          settle();
          resolvePromise(connection);
        },
        reject: (error) => {
          settle();
          reject(error);
        },
      };
      const onAbort = () => {
        settle();
        reject(signal?.reason);
      };
      const timer = Number.isFinite(timeoutMs)
        ? setTimeout(() => {
            settle();
            reject(
              namedError(
                SIGNALR_ERROR_NAMES.timeout,
                `Timeout waiting for SignalR connection to ${hub} (${timeoutMs}ms)`,
              ),
            );
          }, Math.min(timeoutMs, MAX_TIMER_MS))
        : undefined;
      set.add(waiter);
      signal?.addEventListener("abort", onAbort, { once: true });
    });

  const start = (baseUrl: string) => {
    if (current) teardown();

    const manager: ConnectionManager<Hub> = createConnectionManager<Hub>({
      baseUrl,
      hubs,
      resolve,
      getAccessToken,
      refCounts,
      stopTimers,
      reconnectListeners,
      connectedBefore,
      dispatch,
      onStatus: (hub, status, error) => {
        if (current === manager) {
          if (status === "connected") flushWaiters(hub);
          if (status === "disconnected") failHub(hub, error);
          else failed.delete(hub);
        }
        runUserCallback(hub, () => statusStore.set(hub, status), reportCallbackError);
        runUserCallback(hub, () => onStatusChange?.(hub, status), reportCallbackError);
      },
      onError: (hub, err, info) => onError?.(hub, err, info),
      isCurrent: () => current === manager,
    });
    current = manager;
    manager.reconcile(); // build eager hubs plus already-referenced lazy hubs
  };

  const teardown = () => {
    // Publish before dispose, so listeners still see the live connection.
    hubs.forEach((h) => {
      const wasIdle = statusStore.get(h) === "idle";
      runUserCallback(h, () => statusStore.set(h, "idle"), reportCallbackError);
      if (wasIdle) return;
      runUserCallback(h, () => onStatusChange?.(h, "idle"), reportCallbackError);
    });
    current?.dispose();
    hubs.forEach((h) => {
      if (resolve(h).lazy && !refCounts.get(h)) connectedBefore.delete(h); // a lazy hub with no consumer starts fresh
    });
    current = null;
    applied = null;
    failed.clear();
  };

  const stop = () => {
    teardown();
    connectedBefore.clear();
  };

  const update = ({ baseUrl, enabled, connectionKey }: SignalRSessionValues) => {
    const next = { baseUrl, enabled: enabled !== false, connectionKey };
    if (
      applied &&
      Object.is(applied.baseUrl, next.baseUrl) &&
      applied.enabled === next.enabled &&
      Object.is(applied.connectionKey, next.connectionKey)
    )
      return;
    teardown();
    applied = next; // before start(), so a nested update() from a status callback wins
    disabled = !(next.enabled && baseUrl);
    if (disabled) hubs.forEach((hub) => rejectWaiters(hub, disabledError(hub)));
    else start(baseUrl!);
  };

  const getConnection: SignalRPublicContext<T>["getConnection"] = (hub) =>
    current?.getConnection(hub) ?? null;
  const getStatus: SignalRPublicContext<T>["getStatus"] = (hub) => statusStore.get(hub);
  const publicContext: SignalRPublicContext<T> = Object.freeze({
    getConnection,
    getStatus,
    waitForConnection,
  });

  const context: SignalRContextValueBase<T, TStore> = {
    getConnection,
    getStatus,
    publicContext,
    statusStore,
    waitForConnection,
    acquire: (hub) => {
      const next = (refCounts.get(hub) ?? 0) + 1;
      refCounts.set(hub, next);
      if (next === 1) current?.reconcile();
    },
    release: (hub) => {
      const next = Math.max(0, (refCounts.get(hub) ?? 0) - 1);
      refCounts.set(hub, next);
      if (next === 0) current?.reconcile();
    },
    registerReconnect: (hub, cb) => {
      let set = reconnectListeners.get(hub);
      if (!set) reconnectListeners.set(hub, (set = new Set()));
      set.add(cb);
      return () => set!.delete(cb);
    },
    subscribe: (hub, event, handler) => {
      let byEvent = handlers.get(hub);
      if (!byEvent) handlers.set(hub, (byEvent = new Map()));
      let set = byEvent.get(event);
      if (!set) byEvent.set(event, (set = new Set()));
      set.add(handler);
      return () => set.delete(handler);
    },
  };

  return { stop, update, context, publicContext };
}
