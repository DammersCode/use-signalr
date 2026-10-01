import { createSignalRSession, hubKeys, resolveHubConfig } from "@dammers/use-signalr-core";
import type { HubConnectionStatus, HubString, InferContract, StatusStore } from "@dammers/use-signalr-core";
import { hubs } from "./contract";

type Contract = InferContract<typeof hubs>;
type Hub = keyof Contract & HubString;
// ---cut---
const config = { hubs };
const statuses = new Map<Hub, HubConnectionStatus>();
const statusStore: StatusStore<Hub> = {
  get: (hub) => statuses.get(hub) ?? "idle",
  set: (hub, status) => void statuses.set(hub, status),
};

const session = createSignalRSession<Contract>({
  hubs: hubKeys(config),
  resolve: (hub) => resolveHubConfig(config, hub),
  statusStore,
  getAccessToken: () => "token",
  onError: (hub, error, info) => console.error(hub, info.source, error),
});

// A client-only lifecycle hook runs this when a value changes.
session.update({ baseUrl: "https://example.com", enabled: true, connectionKey: "user-1" });

// The teardown hook runs this.
session.stop();
