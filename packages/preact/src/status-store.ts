import type { HubConnectionStatus, StatusStore as StatusStoreBase } from "@dammers/use-signalr-core";

export interface StatusStore<H extends string> extends StatusStoreBase<H> {
  subscribe: (hub: H, listener: () => void) => () => void;
}

/** Separate listener sets keep status updates granular per hub. */
export function createStatusStore<H extends string>(): StatusStore<H> {
  const statuses = new Map<H, HubConnectionStatus>();
  const listeners = new Map<H, Set<() => void>>();
  return {
    get: (hub) => statuses.get(hub) ?? "disconnected",
    set: (hub, status) => {
      if (statuses.get(hub) === status) return;
      statuses.set(hub, status);
      listeners.get(hub)?.forEach((listener) => listener());
    },
    subscribe: (hub, listener) => {
      let set = listeners.get(hub);
      if (!set) listeners.set(hub, (set = new Set()));
      set.add(listener);
      return () => set!.delete(listener);
    },
  };
}
