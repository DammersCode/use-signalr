import { createSignalRClient } from "@dammers/use-signalr-svelte";
import { hubs } from "@examples/contract";

export const {
  provideSignalR,
  getSignalR,
  onHubEvent,
  hubInvoke,
  hubSend,
  hubTeardown,
  hubStatus,
  onReconnected,
} = createSignalRClient({ hubs });
