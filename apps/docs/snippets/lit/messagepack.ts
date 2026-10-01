import { createSignalRClient } from "@dammers/use-signalr-lit";
import { MessagePackHubProtocol } from "@microsoft/signalr-protocol-msgpack";
import { hubs } from "./contract";

export const signalR = createSignalRClient({
  hubs,
  hubProtocol: () => new MessagePackHubProtocol(),
});
