import { createSignalRClient } from "../create-signalr-client";
import { event, method } from "../types";

// Compile-time-only checks that the app contract is correctly INFERRED from
// `event()`/`method()` declarations in the config, end to end through
// `createSignalRClient`. Included by tsconfig.json (unlike *.test.ts), so
// `npm run typecheck` actually enforces the @ts-expect-error assertions below.

const { useSignalREffect, useSignalRInvoke } = createSignalRClient({
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
useSignalREffect("/hubs/chat", "OnFoo", (x) => {
  const n: number = x;
  void n;
});

// Invalid: an event name never declared via event() is a compile error.
useSignalREffect(
  "/hubs/chat",
  // @ts-expect-error - OnBaz was never declared via event() on this hub
  "OnBaz",
  () => {},
);

// EventArgs inference: event<[user: { id: string }]>() yields a handler arg
// typed { id: string }, not e.g. { id: number }.
useSignalREffect("/hubs/chat", "OnUser", (user) => {
  const id: string = user.id;
  void id;
  // @ts-expect-error - user.id is a string, not a number
  const bad: number = user.id;
  void bad;
});

// MethodReturn inference: method<[string], number>() gives a Promise<number>.
async function checkInvoke() {
  const getCount = useSignalRInvoke("/hubs/chat", "GetCount");
  const count: number = await getCount("active");
  void count;
  // @ts-expect-error - GetCount returns number, not string
  const bad: string = await getCount("active");
  void bad;
}
void checkInvoke;

// Invalid: a method name never declared via method() is a compile error.
// @ts-expect-error - GetBaz was never declared via method() on this hub
useSignalRInvoke("/hubs/chat", "GetBaz");
