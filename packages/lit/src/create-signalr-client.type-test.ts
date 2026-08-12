import type { ReactiveControllerHost } from "lit";
import { createSignalRClient } from "./create-signalr-client.js";
import { event, method } from "@dammers/use-signalr-core";

// Compile-time-only checks that the app contract is correctly INFERRED from
// `event()`/`method()` declarations in the config, end to end through
// `createSignalRClient`. Included by tsconfig.json, unlike *.test.ts, so
// `npm run typecheck` enforces the negative assertions below.

declare const host: ReactiveControllerHost;

const client = createSignalRClient({
  hubs: {
    "/hubs/chat": {
      events: {
        OnFoo: event<[x: number]>(),
        OnUser: event<[user: { id: string }]>(),
      },
      methods: {
        GetCount: method<[filter: string], number>(),
        Join: method<[room: string, silent: boolean]>(),
      },
    },
  },
});

const session = client.createSession({
  baseUrl: "https://example.test",
  accessTokenFactory: () => "token",
  onStatusChange: (hub) => {
    const exactHub: "/hubs/chat" = hub;
    void exactHub;
  },
});

// --- Hub names ---
const controller = session.hub(host, "/hubs/chat", { reactiveStatus: true });
// @ts-expect-error - /hubs/missing was never declared in the config
session.hub(host, "/hubs/missing");

// --- Event names and args ---
controller.on("OnFoo", (x) => {
  const n: number = x;
  void n;
});

// @ts-expect-error - OnBaz was never declared via event() on this hub
controller.on("OnBaz", () => {});

// EventArgs inference: event<[user: { id: string }]>() yields a handler arg
// typed { id: string }, not { id: number } or another shape.
controller.on("OnUser", (user) => {
  const id: string = user.id;
  void id;
  // @ts-expect-error - user.id is a string, not a number
  const bad: number = user.id;
  void bad;
});

// @ts-expect-error - OnFoo pushes a number, so the handler cannot take a string
controller.on("OnFoo", (x: string) => void x);

// @ts-expect-error - OnFoo pushes exactly one argument
controller.on("OnFoo", (x: number, extra: number) => void [x, extra]);

// --- Method names, args, and returns ---
async function checkInvoke() {
  const getCount = controller.invoke("GetCount");
  const count: number = await getCount("active");
  void count;
  // @ts-expect-error - GetCount returns number, not string
  const bad: string = await getCount("active");
  void bad;
  // @ts-expect-error - GetCount takes a string filter, not a number
  await getCount(1);
  // @ts-expect-error - GetCount takes exactly one argument
  await getCount("active", "extra");

  const join = controller.invoke("Join");
  await join("room-1", true);
  // @ts-expect-error - Join takes (string, boolean), not (string, string)
  await join("room-1", "yes");
}
void checkInvoke;

// @ts-expect-error - GetBaz was never declared with method() on this hub
controller.invoke("GetBaz");

// --- send typing ---
async function checkSend() {
  const send = controller.send("GetCount");
  const sent: boolean = await send("active");
  void sent;
  // @ts-expect-error - GetCount takes a string filter, not a number
  await send(1);
}
void checkSend;

// --- teardown typing ---
async function checkTeardown() {
  const teardown = controller.teardown("Join");
  const done: boolean = await teardown("room-1", true);
  void done;
  // @ts-expect-error - Join takes (string, boolean), not (string, string)
  await teardown("room-1", "yes");
}
void checkTeardown;
