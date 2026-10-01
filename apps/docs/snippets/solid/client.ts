import { createSignalRClient } from "@dammers/use-signalr-solid";
import { hubs } from "./contract";

export const {
  SignalRProvider,
  useSignalREffect,
  useSignalRInvoke,
  useSignalRSend,
  useSignalRTeardown,
  useHubStatus,
  useOnReconnected,
} = createSignalRClient({ hubs });
