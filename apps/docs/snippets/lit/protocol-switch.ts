import { createSignalRClient } from "@dammers/use-signalr-lit";
import { JsonHubProtocol } from "@microsoft/signalr";
import { MessagePackHubProtocol } from "@microsoft/signalr-protocol-msgpack";
import { hubs } from "./contract";

declare function getToken(): Promise<string>;

let useBinary = true;

const signalR = createSignalRClient({
  hubs,
  hubProtocol: () => (useBinary ? new MessagePackHubProtocol() : new JsonHubProtocol()),
});

const session = signalR.createSession({
  baseUrl: "https://api.example.com",
  accessTokenFactory: () => localStorage.getItem("token") ?? "",
  connectionKey: String(useBinary),
});

export function switchProtocol(binary: boolean) {
  useBinary = binary;
  session.update({ connectionKey: String(binary) });
}
