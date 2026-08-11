import { readonly, shallowRef } from "vue";
import type { Ref } from "vue";
import type {
  HubConnectionStatus,
  StatusStore as StatusStoreBase,
} from "@dammers/use-signalr-core";

export interface StatusStore<H extends string> extends StatusStoreBase<H> {
  ref: (hub: H) => Readonly<Ref<HubConnectionStatus>>;
}

/** One shallow ref per hub prevents unrelated status writes from invalidating it. */
export function createStatusStore<H extends string>(): StatusStore<H> {
  const refs = new Map<H, Ref<HubConnectionStatus>>();
  const getOrCreate = (hub: H) => {
    let value = refs.get(hub);
    if (!value) {
      value = shallowRef<HubConnectionStatus>("disconnected");
      refs.set(hub, value);
    }
    return value;
  };
  return {
    get: (hub) => getOrCreate(hub).value,
    set: (hub, status) => {
      const value = getOrCreate(hub);
      if (value.value !== status) value.value = status;
    },
    ref: (hub) => readonly(getOrCreate(hub)),
  };
}
