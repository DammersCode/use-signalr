import { createSignalRClient } from "@dammers/use-signalr-angular";
import { MessagePackHubProtocol } from "@microsoft/signalr-protocol-msgpack";
import { hubs } from "./contract";

export const { provideSignalR, injectHubEvent, injectHubInvoke } = createSignalRClient({
  hubs,
  hubProtocol: () => new MessagePackHubProtocol(),
});
