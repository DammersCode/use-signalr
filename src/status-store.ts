import type { HubConnectionStatus } from "./types";

/**
 * Tiny external store for hub statuses, consumed via `useSyncExternalStore`.
 * Exposes only `subscribe`/`get`/`set` — no whole-record snapshot — so a
 * per-hub selector lets React bail out when an unrelated hub's status changes.
 */
export interface StatusStore<H extends string> {
  subscribe: (listener: () => void) => () => void;
  get: (hub: H) => HubConnectionStatus;
  set: (hub: H, status: HubConnectionStatus) => void;
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
      if (snapshot.get(hub) === status) return; // dedupe -> no spurious notify
      snapshot.set(hub, status);
      listeners.forEach((l) => l());
    },
  };
}
