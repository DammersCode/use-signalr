import type { ReactiveControllerHost } from "lit";
import { event, method } from "@dammers/use-signalr-core";
import { createSignalRClient } from "./create-signalr-client";

declare const host: ReactiveControllerHost;

const client = createSignalRClient({
  hubs: {
    "/chat": {
      events: { Tick: event<[value: number]>() },
      methods: { Count: method<[id: string], number>() },
    },
  },
});
const session = client.createSession({
  baseUrl: "https://example.test",
  accessTokenFactory: () => "token",
  onStatusChange: (hub) => {
    const value: "/chat" = hub;
    void value;
  },
});
const controller = session.hub(host, "/chat", { reactiveStatus: true });

controller.on("Tick", (value) => {
  const number: number = value;
  void number;
});
// @ts-expect-error event is not declared
controller.on("Missing", () => {});
// @ts-expect-error hub is not declared
session.hub(host, "/missing");

async function checkCalls() {
  const invoke = controller.invoke("Count");
  const result: number = await invoke("room");
  void result;
  // @ts-expect-error argument must be a string
  await invoke(1);
  // @ts-expect-error method is not declared
  controller.invoke("Missing");

  const send = controller.send("Count");
  const sent: boolean = await send("room");
  void sent;
  // @ts-expect-error argument must be a string
  await send(1);

  const teardown = controller.teardown("Count");
  const tornDown: boolean = await teardown("room");
  void tornDown;
  // @ts-expect-error argument must be a string
  await teardown(1);
}
void checkCalls;
