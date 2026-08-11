import { createSignalRClient } from "./create-signalr-client";
import { event, method } from "@dammers/use-signalr-core";

// Compile-time-only checks that the app contract is correctly INFERRED from
// `event()`/`method()` declarations in the config, end to end through
// `createSignalRClient`. Included by tsconfig.json, unlike *.test.ts, so
// `npm run typecheck` enforces the @ts-expect-error assertions below.

const { injectHubEvent, injectHubInvoke } = createSignalRClient({
  hubs: {
    "/hubs/chat": {
      events: {
        OnFoo: event<[x: number]>(),
        OnUser: event<[user: { id: string }]>(),
      },
      methods: {
        GetCount: method<[filter: string], number>(),
      },
    },
  },
});

// Valid: declared event name, handler args inferred as [x: number].
injectHubEvent("/hubs/chat", "OnFoo", (x) => {
  const n: number = x;
  void n;
});

// Invalid: an event name never declared with event() is a compile error.
injectHubEvent(
  "/hubs/chat",
  // @ts-expect-error - OnBaz was never declared via event() on this hub
  "OnBaz",
  () => {},
);

// EventArgs inference: event<[user: { id: string }]>() yields a handler arg
// typed { id: string }, not { id: number } or another shape.
injectHubEvent("/hubs/chat", "OnUser", (user) => {
  const id: string = user.id;
  void id;
  // @ts-expect-error - user.id is a string, not a number
  const bad: number = user.id;
  void bad;
});

// MethodReturn inference: method<[string], number>() gives a Promise<number>.
async function checkInvoke() {
  const getCount = injectHubInvoke("/hubs/chat", "GetCount");
  const count: number = await getCount("active");
  void count;
  // @ts-expect-error - GetCount returns number, not string
  const bad: string = await getCount("active");
  void bad;
}
void checkInvoke;

// Invalid: a method name never declared with method() is a compile error.
// @ts-expect-error - GetBaz was never declared with method() on this hub
injectHubInvoke("/hubs/chat", "GetBaz");
