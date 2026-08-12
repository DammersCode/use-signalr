# use-signalr

Typed multi-hub [SignalR](https://learn.microsoft.com/aspnet/core/signalr) client libraries for React, SolidJS, Svelte, Angular, Vue, Preact, and Lit, sharing one framework-free core.

[![license](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

```ts
const { SignalRProvider, useSignalRInvoke } = createSignalRClient({
  hubs: {
    "/hubs/chat": {
      methods: { SendMessage: method<[roomId: string, message: string]>() },
    },
  },
});
```

One factory call returns a framework integration with typed reactive helpers. Event arguments, method arguments, and return values come from the configuration.

---

## Packages

| Package | Description |
| --- | --- |
| [`@dammers/use-signalr-react`](./packages/react/README.md) | Provider + hooks for React. |
| [`@dammers/use-signalr-solid`](./packages/solid/README.md) | Provider + hooks for SolidJS. |
| [`@dammers/use-signalr-svelte`](./packages/svelte/README.md) | Provider + stores for Svelte. |
| [`@dammers/use-signalr-angular`](./packages/angular/README.md) | Provider + signals for Angular. |
| [`@dammers/use-signalr-vue`](./packages/vue/README.md) | Plugin + composables for Vue 3. |
| [`@dammers/use-signalr-preact`](./packages/preact/README.md) | Provider + hooks for native Preact. |
| [`@dammers/use-signalr-lit`](./packages/lit/README.md) | Reactive Controllers for Lit. |
| [`@dammers/use-signalr-core`](./packages/core/README.md) | Framework-free connection lifecycle, contracts, and retry logic. Only needed if you are writing an adapter. |

Each package README covers install and usage for that framework. This document covers the concepts shared by all of them.

## Capability matrix

All seven adapters implement the same capabilities. Tests cover every cell.

| Capability | react | solid | svelte | angular | vue | preact | lit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Typed events | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Typed invoke / send / teardown | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Per-hub connection status | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Lazy hubs + grace period | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Reconnect hook | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| SSR-safe import | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Granular per-hub subscriptions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Rebuild on option change | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | manual |

Lit reads `baseUrl` and `enabled` once, when the first host connects. To change them, call `session.stop()` and create a new session.

### Minimum versions

| Package | Framework | SignalR client |
| --- | --- | --- |
| `@dammers/use-signalr-react` | react ≥ 19 | `@microsoft/signalr` ≥ 8 |
| `@dammers/use-signalr-solid` | solid-js ≥ 1.7 | `@microsoft/signalr` ≥ 8 |
| `@dammers/use-signalr-svelte` | svelte ≥ 4 | `@microsoft/signalr` ≥ 8 |
| `@dammers/use-signalr-angular` | @angular/core ≥ 20 | `@microsoft/signalr` ≥ 8 |
| `@dammers/use-signalr-vue` | vue ≥ 3.3 | `@microsoft/signalr` ≥ 8 |
| `@dammers/use-signalr-preact` | preact ≥ 10 | `@microsoft/signalr` ≥ 8 |
| `@dammers/use-signalr-lit` | lit ≥ 3 | `@microsoft/signalr` ≥ 8 |

The Angular `rxjs-interop` entry point needs `rxjs` ≥ 7. This peer dependency is optional.

## The contract

The **keys of `config.hubs` declare the hubs**. Each hub's `events` (what the server pushes to you) and `methods` (what you invoke) are declared inline with the `event()` and `method()` markers.

```ts
// signalr.ts
import { createSignalRClient, event, method } from "@dammers/use-signalr-react"; // or another framework package

export const client = createSignalRClient({
  hubs: {
    "/hubs/chat": {
      events: {
        ReceiveMessage: event<[user: string, message: string]>(),
      },
      methods: {
        SendMessage: method<[roomId: string, message: string]>(),
        JoinRoom: method<[roomId: string], { success: boolean }>(),
      },
      // per-hub config also goes here (see "Per-hub config")
    },
  },
  // global defaults (all optional):
  // lazy: false, reconnect: true, maxConnectRetries: 2, logLevel: LogLevel.Information
});
```

`event<Args>()` takes the handler's argument tuple. `method<Args, Return>()` takes the argument tuple and the resolved return type (default `void`). No hand-written contract type — everything downstream (hook args, handler args, return values) is inferred from this config.

## Features

- **Many hubs, one provider.** Each hub gets its own connection, status, config, and lifecycle.
- **Fully typed, contract inferred from config.** Declare events and methods once with `event()`/`method()`. No hand-written contract type.
- **Per-hub and global config.** Set defaults once, then override per hub: reconnect, retries, transport, logging, lazy behavior.
- **Auto-reconnect** with a retry budget for the first connect.
- **Invoke retry** for idempotent methods, with jittered backoff.
- **Lazy hubs.** Connect on first use, disconnect after a grace period on last unmount.
- **Reconnect hooks** to refetch stale state after a reconnect.
- **Auth via props** — `baseUrl` and `accessTokenFactory`, gated by `enabled`. Token rotation needs no rebuild.
- **Zero runtime deps in core.** Peer deps only: `@microsoft/signalr`, plus your framework.

## Per-hub config

Each value in `config.hubs` overrides the global defaults for that hub, alongside its `events`/`methods` declarations:

```ts
createSignalRClient({
  hubs: {
    "/hubs/chat": {
      events: { ReceiveMessage: event<[user: string, message: string]>() },
      methods: { SendMessage: method<[roomId: string, message: string]>() },
    },
    "/hubs/presence": {
      events: { UserOnline: event<[userId: string]>() },
      lazy: true, // connect only when first used
      graceMs: 5000, // wait 5s after last consumer before disconnect
      reconnect: [0, 2000, 10000, 30000], // custom retry delays (ms)
      maxConnectRetries: 5,
      transport: HttpTransportType.WebSockets,
      skipNegotiation: true,
    },
  },
  lazy: false, // global default for all hubs
  reconnect: true, // true | false | number[] | IRetryPolicy
  maxConnectRetries: 2,
});
```

### Lazy hubs

With `lazy: true`, a hub connects only when the first consumer that uses it sets up (any hook for that hub), and disconnects `graceMs` after the last one tears down. Ref-counted. Default is eager.

### Invoke retry

The invoke hook fails fast by default (`retries: 0`) and rethrows the raw server error. Opt in **only for idempotent methods** — a retried invoke is at-least-once:

```ts
const undo = useSignalRInvoke("/hubs/flow", "UndoAsync", {
  retries: 2, // retry RETRIABLE failures (transport drops, 5xx, timeouts)
  timeout: 15000, // per-attempt deadline for the wait for a connected hub
  backoff: [250, 1000, 3000], // or (attempt) => ms; capped 30s, jittered
});
```

Business errors (a `HubException` thrown while still connected) are **never** retried.

`timeout` bounds only the wait for a connected hub before dispatch. SignalR cannot cancel an invocation after dispatch. Component cleanup aborts pending waits and retry backoffs for every in-flight call, unless you pass `keepAliveOnUnmount`.

### Errors

Retriable connect errors retry silently with backoff. `onError` fires only when the retry budget is exhausted, or when the error is not retriable.

`InvokeError` carries `cause` (the last underlying error), `attempts` (the total number of attempts), and `retriable` (whether the final failure was classed as retriable). It is thrown only when you set `retries` above `0`. With the default `retries: 0`, the raw server error propagates unchanged.

### send vs invoke vs teardown — which call to use

The three "call the server" hooks differ in how they wait, what they return, and what happens on teardown. Pick by intent:

|                           | invoke                                  | send                                            | teardown                         |
| ------------------------- | --------------------------------------- | ----------------------------------------------- | -------------------------------- |
| **Waits for connection**  | yes (up to `timeout`)                   | no                                              | yes (up to `timeout`)            |
| **Not connected yet**     | waits, then invokes                     | **drops** (resolves `false`)                    | **queues**, flushes on connect   |
| **Returns**               | the method's typed result               | `boolean` (dispatched?)                         | `boolean` (dispatched?)          |
| **On teardown**           | aborts in-flight call¹                  | unaffected (reads conn at call time)            | **survives** (runs detached)     |
| **Holds a lazy hub open** | while set up                            | while set up                                    | until the flush completes        |
| **Use for**               | request/response you need the result of | high-frequency loss-OK signals (typing, cursor) | one-shot teardown that must land |

¹ Only a pending wait or a mid-backoff retry is actually cancelled. A dispatched invocation runs to completion, because SignalR cannot cancel it. Pass `{ keepAliveOnUnmount: true }` to keep the call alive.

#### Reliable join/leave (session pattern)

A common pattern joins a session on setup and leaves it during teardown. A plain invoke or send call makes the **leave** unreliable:

- Invoke aborts in-flight calls on teardown, so a leave issued during cleanup can be cancelled before it reaches the server.
- Send drops silently if the hub is not `Connected`, so a leave that races a still-connecting socket (a fast route switch, a double-mount) is lost.

The teardown hook fixes both problems. It:

- **survives the calling component's teardown** — it runs detached and is never aborted,
- **queues while connecting** — it waits up to `timeout` (default 10s) for the hub, then sends, instead of dropping,
- **holds a lazy hub open** until the flush completes, even if the tearing-down component was its last consumer.

It is best-effort and fire-and-forget: it resolves `true` once dispatched, `false` if the hub never connected in time, and never throws.

> If your leave already uses invoke and only needs to avoid the abort on teardown, pass `{ keepAliveOnUnmount: true }`. This covers the abort case but **not** the still-connecting race. For that race, use the teardown hook.

See your framework's README for the exact join/leave code (React's `useEffect` cleanup, Solid's `onCleanup`).

## Notes

- The provider rebuilds connections when `baseUrl`, `enabled`, or `connectionKey` change. Token _rotation_ alone does **not** trigger a rebuild — `accessTokenFactory` is re-read on every negotiate.
- `accessTokenFactory` and the `on*` callbacks always see your latest props. Passing a fresh closure each render/run is fine — it causes no reconnect storm, so you do not need to memoize them.

## Migrating from `@dammers/use-signalr`

`@dammers/use-signalr` (≤0.3.x, React-only) is superseded by `@dammers/use-signalr-react`. The API is unchanged — update the package name in your install and imports.

## Contributing

Setup, scripts, and workflow live in [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE) © [DammersCode](https://github.com/DammersCode)
