import type { HubConnectionStatus } from "./types";

/** Per-hub status store: point reads and writes keyed by hub. */
export interface StatusStore<H extends string> {
  get: (hub: H) => HubConnectionStatus;
  set: (hub: H, status: HubConnectionStatus) => void;
}
