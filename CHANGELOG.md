# Changelog

## 0.3.0

### Changed (breaking)

- **The app contract is now INFERRED from `config.hubs`, not hand-written.**
  Previously you wrote a `SignalRContract` type by hand and passed it as
  `createSignalRClient<AppContract>({ hubs: {...} })`. Now each hub's events
  and methods are declared directly in the config using the new `event()` and
  `method()` markers, and the contract is derived automatically:

  ```ts
  // Before (0.2.x)
  type AppHubs = {
    "/hubs/chat": {
      events: { ReceiveMessage: (user: string, message: string) => void };
      methods: { SendMessage: (roomId: string, message: string) => Promise<void> };
    };
  };
  createSignalRClient<AppHubs>({ hubs: { "/hubs/chat": {} } });

  // After (0.3.0)
  createSignalRClient({
    hubs: {
      "/hubs/chat": {
        events: { ReceiveMessage: event<[user: string, message: string]>() },
        methods: { SendMessage: method<[roomId: string, message: string]>() },
      },
    },
  });
  ```

  `createSignalRClient` is no longer called with an explicit generic — its
  type parameter is inferred from the config value itself.

- **All declared events are now always pre-bound; the `events: { X: true }`
  opt-in map is gone.** Previously you separately listed which events to
  pre-bind (as a no-op handler, to silence `@microsoft/signalr`'s "No client
  method found" warning). Now every event declared via `event()` in a hub's
  config is automatically pre-bound — the warning is impossible by
  construction. There is nothing left to opt into or keep in sync with the
  contract.

### Added

- **`event<Args>()`** — declares one of a hub's server-pushed events. The
  type parameter is the handler's argument tuple, e.g.
  `event<[user: string, message: string]>()`.
- **`method<Args, Return>()`** — declares one of a hub's invocable server
  methods. Type parameters are the argument tuple and the resolved return
  type, e.g. `method<[roomId: string], { success: boolean }>()`.
- **`HubDef`, `EventDef`, `MethodDef`, `InferContract`** — exported types
  backing the new config-first contract inference, for anyone building
  tooling on top of the library.

## 0.2.0

### Added

- **`useSignalRTeardown(hub, method, options?)`** — a reliable teardown sender
  for a method called in an effect cleanup. Unlike `useSignalRSend` (drops if
  not yet connected) and `useSignalRInvoke` (aborts in-flight calls on unmount),
  it survives the calling component's unmount, queues while the hub is still
  connecting (flushes on connect, up to `timeout`), and holds a lazy hub open
  until the flush completes. Best-effort fire-and-forget: resolves `true` when
  dispatched, `false` if the hub never connected in time; never throws. Fixes
  stranded server-side session state under React StrictMode and fast route
  switches. **New public export.**
- **`InvokeOptions.keepAliveOnUnmount`** — opt-out on `useSignalRInvoke`: when
  `true`, an in-flight call (including a mid-backoff retry) is **not** aborted
  when the calling component unmounts. Default `false` (unchanged behavior).
  Covers the abort-on-unmount half only; for the still-connecting race, prefer
  `useSignalRTeardown`.
- **`TeardownOptions`** type — exported (`{ timeout?: number }`).

### Changed

- **Public API surface:** `createSignalRClient()` now also returns
  `useSignalRTeardown`. `InvokeOptions` gains the optional `keepAliveOnUnmount`
  field. Both additive — existing `useSignalRInvoke` / `useSignalRSend` behavior
  is unchanged for current callers.

### Internal

- Added a Vitest + Testing Library + jsdom test setup (dev-only; no new peer
  deps, `sideEffects: false` preserved). Tests cover the mid-backoff
  abort-vs-keep-alive distinction and the queue-while-connecting leave.
