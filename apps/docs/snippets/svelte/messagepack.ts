import { MessagePackHubProtocol } from "@microsoft/signalr-protocol-msgpack";
import { createSignalRClient } from "@dammers/use-signalr-svelte";
import { hubs } from "./contract";

export const client = createSignalRClient({
  hubs,
  hubProtocol: () => new MessagePackHubProtocol(),
});
