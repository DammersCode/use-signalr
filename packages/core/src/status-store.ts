import type { HubConnectionStatus } from "./types.js";

/** Per-hub status store: point reads and writes keyed by hub. */
export interface StatusStore<H extends string> {
  /** Returns the status of a hub. Must return `"idle"` for a hub without a value. */
  get: (hub: H) => HubConnectionStatus;
  /** Stores the status of a hub. */
  set: (hub: H, status: HubConnectionStatus) => void;
}
