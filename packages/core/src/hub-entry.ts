import type { HubConnection } from "@microsoft/signalr";
import type { HubConnectionStatus } from "./types.js";

/** Live state for one hub connection, owned by the connection manager. */
export interface HubEntry {
  connection: HubConnection;
  status: HubConnectionStatus;
  /** Resolves once Connected. Replaced on each rebuild. */
  ready: Promise<void>;
  resolveReady: () => void;
  /** Set before stop(), so the start() catch never reconnects a stopped hub. */
  stopping: boolean;
}
