import { createSignalRClient } from "@dammers/use-signalr-solid";
import { MessagePackHubProtocol } from "@microsoft/signalr-protocol-msgpack";
import { hubs } from "./contract";

export const client = createSignalRClient({
  hubs,
  hubProtocol: () => new MessagePackHubProtocol(),
});
