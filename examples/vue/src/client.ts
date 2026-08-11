import { createSignalRClient } from "@dammers/use-signalr-vue";
import { hubs } from "@examples/contract";

export const signalR = createSignalRClient({ hubs });
export const {
  useSignalREvent,
  useSignalRInvoke,
  useSignalRSend,
  useSignalRTeardown,
  useHubStatus,
  useOnReconnected,
} = signalR;
