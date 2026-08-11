import { createConnectionManager } from "./connection-manager";
import type { ConnectionManager } from "./connection-manager";
import type { StatusStore } from "./status-store";
import type {
  HubConnectionStatus,
  HubString,
  ResolvedHubConfig,
  SignalRContract,
} from "./types";
import type { SignalRContextValueBase } from "./context";

export interface SignalRSessionDeps<
  T extends SignalRContract,
  TStore extends StatusStore<keyof T & HubString> = StatusStore<keyof T & HubString>,
> {
  hubs: Array<keyof T & HubString>;
  resolve: (hub: keyof T & HubString) => ResolvedHubConfig;
  statusStore: TStore;
  /** Read at call time so token rotation never rebuilds the connection. */
  getAccessToken: () => string | Promise<string>;
  onStatusChange?: (hub: keyof T & HubString, status: HubConnectionStatus) => void;
  onError?: (hub: keyof T & HubString, error: unknown) => void;
}

export interface SignalRSession<
  T extends SignalRContract,
  TStore extends StatusStore<keyof T & HubString> = StatusStore<keyof T & HubString>,
> {
  /** Build/replace the live manager generation for this baseUrl. Disposes the previous one. */
  start: (baseUrl: string) => void;
  /** Dispose the live generation and mark every hub disconnected. Idempotent. */
  stop: () => void;
  /** The value an adapter puts into its framework context. Stable identity. */
  context: SignalRContextValueBase<T, TStore>;
}

/**
 * Owns the adapter-facing half of a provider: the manager generation, lazy
 * ref-counts, reconnect listeners, and the context value built on top of
 * them. Framework adapters own only reactive translation, context
 * propagation, and lifecycle binding — everything else lives here.
 */
export function createSignalRSession<
  T extends SignalRContract,
  TStore extends StatusStore<keyof T & HubString> = StatusStore<keyof T & HubString>,
>(deps: SignalRSessionDeps<T, TStore>): SignalRSession<T, TStore> {
  type Hub = keyof T & HubString;
  const { hubs, resolve, statusStore, getAccessToken, onStatusChange, onError } = deps;

  // Lazy ref-counts, pending stop timers, and reconnect listeners persist
  // across rebuilds. The live manager is swapped per generation.
  const refCounts = new Map<Hub, number>();
  const stopTimers = new Map<Hub, ReturnType<typeof setTimeout>>();
  const reconnectListeners = new Map<Hub, Set<() => void>>();
  let current: ConnectionManager<Hub> | null = null;

  const start = (baseUrl: string) => {
    current?.dispose();
    current = null;

    const manager: ConnectionManager<Hub> = createConnectionManager<Hub>({
      baseUrl,
      hubs,
      resolve,
      getAccessToken: () => getAccessToken(),
      refCounts,
      stopTimers,
      reconnectListeners,
      onStatus: (hub, status) => {
        statusStore.set(hub, status);
        onStatusChange?.(hub, status);
      },
      onError: (hub, err) => onError?.(hub, err),
      isCurrent: () => current === manager,
    });
    current = manager;
    manager.reconcile(); // build eager hubs plus already-referenced lazy hubs
  };

  const stop = () => {
    // Notify synchronous adapter stores while the live connections are still
    // available, so they can detach event handlers deterministically.
    hubs.forEach((h) => statusStore.set(h, "disconnected"));
    current?.dispose();
    current = null;
  };

  const context: SignalRContextValueBase<T, TStore> = {
    getConnection: (hub) => current?.getConnection(hub) ?? null,
    isHubConnected: (hub) => statusStore.get(hub) === "connected",
    getStatus: (hub) => statusStore.get(hub),
    statusStore,
    waitForConnection: (hub, timeoutMs) => {
      if (!current) {
        return Promise.reject(new Error(`SignalR not connected: ${String(hub)}`));
      }
      return current.waitForConnection(hub, timeoutMs);
    },
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
  };

  return { start, stop, context };
}
