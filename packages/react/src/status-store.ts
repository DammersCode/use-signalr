import type {
  HubConnectionStatus,
  StatusStore as StatusStoreBase,
} from "@dammers/use-signalr-core";

/**
 * Small external store for hub statuses, consumed with `useSyncExternalStore`.
 * Exposes only `subscribe`, `get`, and `set` — no whole-record snapshot — so
 * a per-hub selector lets React skip a re-render when an unrelated hub's
 * status changes.
 */
export interface StatusStore<H extends string> extends StatusStoreBase<H> {
  subscribe: (listener: () => void) => () => void;
}

export function createStatusStore<H extends string>(): StatusStore<H> {
  const snapshot = new Map<H, HubConnectionStatus>();
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: (hub) => snapshot.get(hub) ?? "disconnected",
    set: (hub, status) => {
      if (snapshot.get(hub) === status) return; // dedupe: skip a spurious notify
      snapshot.set(hub, status);
      listeners.forEach((l) => l());
    },
  };
}
