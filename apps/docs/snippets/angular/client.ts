import { createSignalRClient } from "@dammers/use-signalr-angular";
import { hubs } from "./contract";

export const {
  provideSignalR,
  injectHubEvent,
  injectHubInvoke,
  injectHubSend,
  injectHubTeardown,
  injectHubStatus,
  injectOnReconnected,
  injectKeepHubAlive,
} = createSignalRClient({ hubs });
