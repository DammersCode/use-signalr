import { writable, get as readStore } from "svelte/store";
import type { Readable, Writable } from "svelte/store";
import type { HubConnectionStatus, StatusStore as StatusStoreBase } from "@dammers/use-signalr-core";

export interface StatusStore<H extends string> extends StatusStoreBase<H> {
  /** Readable store for one hub's status; subscribe with `$` in components. */
  readable: (hub: H) => Readable<HubConnectionStatus>;
}

/** Hub statuses, backed by one Svelte writable per hub, created on first access. */
export function createStatusStore<H extends string>(): StatusStore<H> {
  const stores = new Map<H, Writable<HubConnectionStatus>>();

  const getOrCreate = (hub: H) => {
    let store = stores.get(hub);
    if (!store) {
      store = writable<HubConnectionStatus>("idle");
      stores.set(hub, store);
    }
    return store;
  };

  return {
    get: (hub) => readStore(getOrCreate(hub)),
    set: (hub, status) => getOrCreate(hub).set(status),
    readable: (hub) => ({ subscribe: getOrCreate(hub).subscribe }),
  };
}
