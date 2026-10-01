import { signal } from "@angular/core";
import type { Signal, WritableSignal } from "@angular/core";
import type { HubConnectionStatus, StatusStore as StatusStoreBase } from "@dammers/use-signalr-core";

export interface StatusStore<H extends string> extends StatusStoreBase<H> {
  /** The underlying per-hub signal; read it directly for a `computed()`/template binding. */
  signal: (hub: H) => Signal<HubConnectionStatus>;
}

/** Hub statuses in one lazy `signal()` per hub, so a write to hub B never recomputes hub A. */
export function createStatusStore<H extends string>(): StatusStore<H> {
  const signals = new Map<H, WritableSignal<HubConnectionStatus>>();

  const getOrCreate = (hub: H) => {
    let s = signals.get(hub);
    if (!s) {
      s = signal<HubConnectionStatus>("idle");
      signals.set(hub, s);
    }
    return s;
  };

  return {
    get: (hub) => getOrCreate(hub)(),
    set: (hub, status) => {
      const s = getOrCreate(hub);
      if (s() === status) return;
      s.set(status);
    },
    signal: (hub) => getOrCreate(hub).asReadonly(),
  };
}
