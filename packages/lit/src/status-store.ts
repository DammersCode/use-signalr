import type {
  HubConnectionStatus,
  StatusStore as StatusStoreBase,
} from "@dammers/use-signalr-core";

export interface StatusStore<H extends string> extends StatusStoreBase<H> {
  subscribe: (hub: H, listener: () => void) => () => void;
}

export function createStatusStore<H extends string>(): StatusStore<H> {
  const values = new Map<H, HubConnectionStatus>();
  const listeners = new Map<H, Set<() => void>>();
  return {
    get: (hub) => values.get(hub) ?? "disconnected",
    set: (hub, status) => {
      if (values.get(hub) === status) return;
      values.set(hub, status);
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
