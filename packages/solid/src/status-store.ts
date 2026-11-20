import { createOwnedWriteSignal } from "./internal/solid-compat.js";
import type { HubConnectionStatus, StatusStore } from "@dammers/use-signalr-core";

export type { StatusStore };

/**
 * Small store for hub statuses, backed by one Solid signal per hub, created
 * lazily on first access. Exposes only `get` and `set` — no whole-record
 * snapshot — so a per-hub read lets an effect track only the hub it reads.
 */
export function createStatusStore<H extends string>(): StatusStore<H> {
  const signals = new Map<H, ReturnType<typeof createOwnedWriteSignal<HubConnectionStatus>>>();
  // Solid 2 batches signal writes, so a read right after a write would see the old value.
  const values = new Map<H, HubConnectionStatus>();

  const getOrCreate = (hub: H) => {
    let entry = signals.get(hub);
    if (!entry) {
      entry = createOwnedWriteSignal<HubConnectionStatus>("idle", { ownedWrite: true });
      signals.set(hub, entry);
    }
    return entry;
  };

  return {
    get: (hub) => {
      getOrCreate(hub)[0]();
      return values.get(hub) ?? "idle";
    },
    set: (hub, status) => {
      values.set(hub, status);
      getOrCreate(hub)[1](status);
    },
  };
}
