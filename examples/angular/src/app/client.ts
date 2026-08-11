import { createSignalRClient } from "@dammers/use-signalr-angular";
import { hubs } from "@examples/contract";

export const {
  provideSignalR,
  injectHubEvent,
  injectHubInvoke,
  injectHubSend,
  injectHubTeardown,
  injectHubStatus,
  injectOnReconnected,
} = createSignalRClient({ hubs });
