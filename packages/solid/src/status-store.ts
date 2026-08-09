import { createSignal } from "solid-js";
import type { Accessor, Setter } from "solid-js";
import type { HubConnectionStatus, StatusStore } from "@dammers/use-signalr-core";

export type { StatusStore };

/**
 * Small store for hub statuses, backed by one Solid signal per hub, created
 * lazily on first access. Exposes only `get` and `set` — no whole-record
 * snapshot — so a per-hub read lets an effect track only the hub it reads.
 */
export function createStatusStore<H extends string>(): StatusStore<H> {
  const signals = new Map<
    H,
    [Accessor<HubConnectionStatus>, Setter<HubConnectionStatus>]
  >();

  const getOrCreate = (hub: H) => {
    let entry = signals.get(hub);
    if (!entry) {
      entry = createSignal<HubConnectionStatus>("disconnected");
      signals.set(hub, entry);
    }
    return entry;
  };

  return {
    // Calling the accessor auto-tracks when invoked inside a reactive scope.
    get: (hub) => getOrCreate(hub)[0](),
    // The setter's default === equality already dedupes; no manual check needed.
    set: (hub, status) => getOrCreate(hub)[1](status),
  };
}
