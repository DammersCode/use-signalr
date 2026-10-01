import { createSignalRClient } from "./create-signalr-client.js";
import { event, method } from "@dammers/use-signalr-core";
import type { HubConnection, IHubProtocol } from "@microsoft/signalr";
import type { HubConnectionStatus } from "@dammers/use-signalr-core";
import { ref } from "vue";
import type { App } from "vue";
import type { SignalROptions } from "./types.js";

// Compile-time-only checks that the app contract is correctly INFERRED from
// `event()`/`method()` declarations in the config, end to end through
// `createSignalRClient`. Included by tsconfig.json, unlike *.test.ts, so
// `npm run typecheck` enforces the negative assertions below.

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

const {
  useSignalREvent,
  useSignalRInvoke,
  useSignalRSend,
  useSignalRTeardown,
  useHubStatus,
} = client;

// --- Plugin install ---
declare const app: App;
app.use(client, {
  baseUrl: ref<string | undefined>("https://example.test"),
  accessTokenFactory: () => "token",
  onStatusChange: (hub) => {
    const exactHub: "/hubs/chat" = hub;
    void exactHub;
  },
});
// @ts-expect-error - accessTokenFactory is required
app.use(client, { baseUrl: "https://example.test" });

// --- SignalROptions takes the hub union ---
const typedOptions: SignalROptions<"/a" | "/b"> = {
  baseUrl: "https://example.test",
  accessTokenFactory: () => "token",
  onStatusChange: (hub) => {
    const exactHub: "/a" | "/b" = hub;
    void exactHub;
  },
};
void typedOptions;
const wrongOptions: SignalROptions<"/a"> = {
  baseUrl: "https://example.test",
  accessTokenFactory: () => "token",
  // @ts-expect-error - /b is not in the hub union
  onStatusChange: (hub: "/b") => void hub,
};
void wrongOptions;

// --- Hub names ---
const status = useHubStatus("/hubs/chat");
// @ts-expect-error - status refs are readonly
status.value = "connected";
// @ts-expect-error - /hubs/missing was never declared in the config
useHubStatus("/hubs/missing");

// --- Event names and args ---
useSignalREvent("/hubs/chat", "OnFoo", (x) => {
  const n: number = x;
  void n;
});

useSignalREvent(
  "/hubs/chat",
  // @ts-expect-error - OnBaz was never declared via event() on this hub
  "OnBaz",
  () => {},
);

// EventArgs inference: event<[user: { id: string }]>() yields a handler arg
// typed { id: string }, not { id: number } or another shape.
useSignalREvent("/hubs/chat", "OnUser", (user) => {
  const id: string = user.id;
  void id;
  // @ts-expect-error - user.id is a string, not a number
  const bad: number = user.id;
  void bad;
});

// @ts-expect-error - OnFoo pushes a number, so the handler cannot take a string
useSignalREvent("/hubs/chat", "OnFoo", (x: string) => void x);

// @ts-expect-error - OnFoo pushes exactly one argument
useSignalREvent("/hubs/chat", "OnFoo", (x: number, extra: number) => void [x, extra]);

// --- Method names, args, and returns ---
async function checkInvoke() {
  const getCount = useSignalRInvoke("/hubs/chat", "GetCount");
  const count: number = await getCount("active");
  void count;
  // @ts-expect-error - GetCount returns number, not string
  const bad: string = await getCount("active");
  void bad;
  // @ts-expect-error - GetCount takes a string filter, not a number
  await getCount(1);
  // @ts-expect-error - GetCount takes exactly one argument
  await getCount("active", "extra");

  const join = useSignalRInvoke("/hubs/chat", "Join");
  await join("room-1", true);
  // @ts-expect-error - Join takes (string, boolean), not (string, string)
  await join("room-1", "yes");
}
void checkInvoke;

// @ts-expect-error - GetBaz was never declared with method() on this hub
useSignalRInvoke("/hubs/chat", "GetBaz");

// --- send typing ---
async function checkSend() {
  const send = useSignalRSend("/hubs/chat", "GetCount");
  const sent: boolean = await send("active");
  void sent;
  // @ts-expect-error - GetCount takes a string filter, not a number
  await send(1);
}
void checkSend;

// --- teardown typing ---
async function checkTeardown() {
  const teardown = useSignalRTeardown("/hubs/chat", "Join");
  const done: boolean = await teardown("room-1", true);
  void done;
  // @ts-expect-error - Join takes (string, boolean), not (string, string)
  await teardown("room-1", "yes");
}
void checkTeardown;

// --- Public context has exactly three members ---
function checkPublicContext() {
  const ctx = client.useSignalR();
  const connection: HubConnection | null = ctx.getConnection("/hubs/chat");
  const status: HubConnectionStatus = ctx.getStatus("/hubs/chat");
  void connection;
  void status;
  // @ts-expect-error - acquire is internal
  ctx.acquire;
  // @ts-expect-error - statusStore is internal
  ctx.statusStore;
  // @ts-expect-error - isHubConnected was removed
  ctx.isHubConnected;
  // @ts-expect-error - /hubs/missing was never declared in the config
  ctx.getStatus("/hubs/missing");
}
void checkPublicContext;

// --- Provider callbacks ---
type PluginOptions = Parameters<NonNullable<typeof client.install>>[1];
export const statusCallbackOk: NonNullable<PluginOptions["onStatusChange"]> = (hub) => {
  const exactHub: "/hubs/chat" = hub;
  void exactHub;
};
export const errorCallbackOk: NonNullable<PluginOptions["onError"]> = (hub) => {
  const exactHub: "/hubs/chat" = hub;
  void exactHub;
};
// @ts-expect-error - /hubs/missing was never declared in the config
export const statusCallbackBad: NonNullable<PluginOptions["onStatusChange"]> = (hub: "/hubs/missing") => {
  void hub;
};
// @ts-expect-error - /hubs/missing was never declared in the config
export const errorCallbackBad: NonNullable<PluginOptions["onError"]> = (hub: "/hubs/missing") => {
  void hub;
};
export const errorInfoTyped: NonNullable<PluginOptions["onError"]> = (_hub, _error, info) => {
  const source: "connection" | "callback" = info.source;
  void source;
};
export const errorInfoBad: NonNullable<PluginOptions["onError"]> = (_hub, _error, info) => {
  // @ts-expect-error - "other" is not a source
  const source: "other" = info.source;
  void source;
};

// --- Hub protocol and builder hook ---
declare const protocol: IHubProtocol;
createSignalRClient({ hubs: {}, hubProtocol: () => protocol, configureBuilder: (builder) => builder });
createSignalRClient({ hubs: { "/hubs/a": { hubProtocol: protocol, configureBuilder: (builder, ctx) => (void ctx.hub, builder) } } });
// @ts-expect-error - configureBuilder must return the builder
createSignalRClient({ hubs: {}, configureBuilder: () => undefined });

// --- Unknown per-hub keys ---
createSignalRClient({
  hubs: {
    "/hubs/a": {
      events: { OnFoo: event<[x: number]>() },
      // @ts-expect-error - skipNegotiation belongs in httpOptions
      skipNegotiation: true,
    },
  },
});
