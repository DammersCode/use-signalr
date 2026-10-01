import { createSignalRClient } from "@dammers/use-signalr-vue";
import { hubs } from "./contract";

export const signalR = createSignalRClient({ hubs });

export const {
  useSignalR,
  useHubConsumer,
  useHubStatus,
  useSignalREvent,
  useSignalRInvoke,
  useSignalRSend,
  useSignalRTeardown,
  useOnReconnected,
} = signalR;
