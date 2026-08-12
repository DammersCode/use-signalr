import { createSignalRClient } from "@dammers/use-signalr-preact";
import { hubs } from "@examples/contract";

export const {
  SignalRProvider,
  useSignalREffect,
  useSignalRInvoke,
  useSignalRSend,
  useSignalRTeardown,
  useHubStatus,
  useOnReconnected,
} = createSignalRClient({ hubs });
