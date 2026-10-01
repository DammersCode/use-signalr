import type { HubConnectionStatus, StatusStore } from "@dammers/use-signalr-core";

export interface ObservableStatusStore<H extends string> extends StatusStore<H> {
  subscribe: (hub: H, listener: () => void) => () => void;
}

export function createStatusStore<H extends string>(): ObservableStatusStore<H> {
  const statuses = new Map<H, HubConnectionStatus>();
  const listeners = new Map<H, Set<() => void>>();
  return {
    get: (hub) => statuses.get(hub) ?? "idle",
    set: (hub, status) => {
      if (statuses.get(hub) === status) return;
      statuses.set(hub, status);
      listeners.get(hub)?.forEach((listener) => listener());
    },
    subscribe: (hub, listener) => {
      let set = listeners.get(hub);
      if (!set) listeners.set(hub, (set = new Set()));
      set.add(listener);
      return () => set.delete(listener);
    },
  };
}
