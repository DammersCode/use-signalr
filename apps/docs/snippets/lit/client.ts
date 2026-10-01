import { createSignalRClient } from "@dammers/use-signalr-lit";
import { hubs } from "./contract";

export const signalR = createSignalRClient({ hubs });
