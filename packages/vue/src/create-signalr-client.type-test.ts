import { event, method } from "@dammers/use-signalr-core";
import { ref } from "vue";
import type { App } from "vue";
import { createSignalRClient } from "./create-signalr-client.js";

const client = createSignalRClient({
  hubs: {
    "/hubs/chat": {
      events: { Receive: event<[message: string]>() },
      methods: { Count: method<[room: string], number>() },
    },
  },
});

declare const app: App;
app.use(client, {
  baseUrl: ref<string | undefined>("https://example.test"),
  accessTokenFactory: () => "token",
  onStatusChange: (hub) => {
    const exactHub: "/hubs/chat" = hub;
    void exactHub;
  },
});

// @ts-expect-error accessTokenFactory is required
app.use(client, { baseUrl: "https://example.test" });

client.useSignalREvent("/hubs/chat", "Receive", (message) => {
  const value: string = message;
  void value;
});
// @ts-expect-error undeclared event
client.useSignalREvent("/hubs/chat", "Missing", () => {});

// @ts-expect-error undeclared hub
client.useHubStatus("/hubs/missing");

const status = client.useHubStatus("/hubs/chat");
// @ts-expect-error status refs are readonly
status.value = "connected";

async function check() {
  const invoke = client.useSignalRInvoke("/hubs/chat", "Count");
  const count: number = await invoke("main");
  void count;
  // @ts-expect-error wrong argument
  await invoke(1);
  // @ts-expect-error Count returns number
  const wrong: string = await invoke("main");
  void wrong;
}
void check();

// @ts-expect-error undeclared method
client.useSignalRInvoke("/hubs/chat", "Missing");
