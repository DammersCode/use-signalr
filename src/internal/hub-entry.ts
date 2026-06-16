import type { HubConnection } from "@microsoft/signalr";
import type { HubConnectionStatus } from "../types";

/** Live state for one hub connection, owned by the connection manager. */
export interface HubEntry {
  connection: HubConnection;
  status: HubConnectionStatus;
  /** Resolves once Connected; replaced on each (re)build. */
  ready: Promise<void>;
  resolveReady: () => void;
  /** Set before stop() so the start() catch never zombie-reconnects. */
  stopping: boolean;
}
