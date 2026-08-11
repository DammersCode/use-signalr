import { event, method } from "@dammers/use-signalr-core";
import { createSignalRClient } from "./create-signalr-client";

const client = createSignalRClient({
  hubs: {
    "/hubs/chat": {
      events: { Receive: event<[message: string]>() },
      methods: { Count: method<[room: string], number>() },
    },
  },
});

client.useSignalREffect("/hubs/chat", "Receive", (message) => {
  const value: string = message;
  void value;
});
// @ts-expect-error event is not declared
client.useSignalREffect("/hubs/chat", "Missing", () => {});
// @ts-expect-error hub is not declared
client.useHubStatus("/hubs/missing");

async function checkInvoke() {
  const invoke = client.useSignalRInvoke("/hubs/chat", "Count");
  const value: number = await invoke("main");
  void value;
  // @ts-expect-error argument must be a string
  await invoke(1);
  // @ts-expect-error method is not declared
  client.useSignalRInvoke("/hubs/chat", "Missing");
  const send = client.useSignalRSend("/hubs/chat", "Count");
  const sent: boolean = await send("main");
  void sent;
  // @ts-expect-error send argument must be a string
  await send(1);
  const teardown = client.useSignalRTeardown("/hubs/chat", "Count");
  const tornDown: boolean = await teardown("main");
  void tornDown;
  // @ts-expect-error teardown argument must be a string
  await teardown(1);
}
void checkInvoke;
