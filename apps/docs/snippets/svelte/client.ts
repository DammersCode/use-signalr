import { createSignalRClient } from "@dammers/use-signalr-svelte";
import { hubs } from "./contract";

export const {
  provideSignalR,
  getSignalR,
  keepHubAlive,
  onHubEvent,
  hubInvoke,
  hubSend,
  hubTeardown,
  hubStatus,
  onReconnected,
} = createSignalRClient({ hubs });
