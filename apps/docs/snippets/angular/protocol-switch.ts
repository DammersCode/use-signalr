import { signal } from "@angular/core";
import { createSignalRClient } from "@dammers/use-signalr-angular";
import { JsonHubProtocol } from "@microsoft/signalr";
import { MessagePackHubProtocol } from "@microsoft/signalr-protocol-msgpack";
import { hubs } from "./contract";

export const useBinary = signal(true);

const { provideSignalR } = createSignalRClient({
  hubs,
  hubProtocol: () => (useBinary() ? new MessagePackHubProtocol() : new JsonHubProtocol()),
});

export const signalRProviders = provideSignalR(() => ({
  baseUrl: "https://api.example.com",
  accessTokenFactory: () => localStorage.getItem("token") ?? "",
  connectionKey: () => String(useBinary()),
}));
