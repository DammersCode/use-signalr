import { signal } from "@angular/core";
import type { WritableSignal } from "@angular/core";
import type { HubConnectionStatus, StatusStore as StatusStoreBase } from "@dammers/use-signalr-core";

export interface StatusStore<H extends string> extends StatusStoreBase<H> {
  /** The underlying per-hub signal; read it directly for a `computed()`/template binding. */
  signal: (hub: H) => WritableSignal<HubConnectionStatus>;
}

/**
 * Small store for hub statuses, backed by one Angular `signal()` per hub,
 * created lazily on first access. Signals need no injector (they can be
 * constructed in a plain class), and a `get`/`computed` on hub A's signal
 * never recomputes when hub B's signal is written — the selective
 * invalidation the adapter contract requires.
 */
export function createStatusStore<H extends string>(): StatusStore<H> {
  const signals = new Map<H, WritableSignal<HubConnectionStatus>>();

  const getOrCreate = (hub: H) => {
    let s = signals.get(hub);
    if (!s) {
      s = signal<HubConnectionStatus>("disconnected");
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
    signal: (hub) => getOrCreate(hub),
  };
}
