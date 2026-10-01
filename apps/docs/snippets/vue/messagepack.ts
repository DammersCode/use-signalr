import { MessagePackHubProtocol } from "@microsoft/signalr-protocol-msgpack";
import { createSignalRClient } from "@dammers/use-signalr-vue";
import { hubs } from "./contract";

export const signalR = createSignalRClient({
  hubs,
  hubProtocol: () => new MessagePackHubProtocol(),
});
