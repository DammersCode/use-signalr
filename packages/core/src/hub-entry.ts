import type { HubConnection } from "@microsoft/signalr";

/** Live state for one hub connection, owned by the connection manager. */
export interface HubEntry {
  connection: HubConnection;
  /** Set before stop(), so the start() catch never reconnects a stopped hub. */
  stopping: boolean;
  /** True from onreconnecting to onreconnected. A close in between means SignalR gave up. */
  reconnecting: boolean;
}
