import { writable, get as readStore } from "svelte/store";
import type { Readable, Writable } from "svelte/store";
import type { HubConnectionStatus, StatusStore as StatusStoreBase } from "@dammers/use-signalr-core";

export interface StatusStore<H extends string> extends StatusStoreBase<H> {
  /** Readable store for one hub's status; subscribe with `$` in components. */
  readable: (hub: H) => Readable<HubConnectionStatus>;
}

/**
 * Small store for hub statuses, backed by one Svelte writable per hub,
 * created lazily on first access. `set` dedupes by hand since a Svelte
 * writable notifies subscribers even on an equal value.
 */
export function createStatusStore<H extends string>(): StatusStore<H> {
  const stores = new Map<H, Writable<HubConnectionStatus>>();

  const getOrCreate = (hub: H) => {
    let store = stores.get(hub);
    if (!store) {
      store = writable<HubConnectionStatus>("disconnected");
      stores.set(hub, store);
    }
    return store;
  };

  return {
    get: (hub) => readStore(getOrCreate(hub)),
    set: (hub, status) => {
      const store = getOrCreate(hub);
      if (readStore(store) === status) return;
      store.set(status);
    },
    readable: (hub) => getOrCreate(hub),
  };
}
