# 🔌 @dammers/use-signalr

> A typed, reusable [SignalR](https://learn.microsoft.com/aspnet/core/signalr) provider and hook set for React, driven by your contract.

[![npm](https://img.shields.io/npm/v/@dammers/use-signalr.svg)](https://www.npmjs.com/package/@dammers/use-signalr)
[![types](https://img.shields.io/badge/types-included-blue.svg)](#-api)
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

One factory call returns a provider and a set of hooks, each typed against your hub contract. Event args, method args, and return values are all inferred from the config.

---

## ✨ Features

- 🌐 **Many hubs, one provider.** Each hub gets its own connection, status, config, and lifecycle.
- 🧠 **Fully typed, contract inferred from config.** Declare events and methods once with `event()`/`method()`. No hand-written contract type.
- ⚙️ **Per-hub and global config.** Set defaults once, then override per hub: reconnect, retries, transport, logging, lazy behavior.
- ♻️ **Auto-reconnect** with a retry budget for the first connect.
- 🔁 **Invoke retry** for idempotent methods, with jittered backoff.
- 💤 **Lazy hubs.** Connect on first use, disconnect after a grace period on last unmount.
- 🟢 **Live per-hub status**, re-rendering only the components that watch it.
- 🔄 **Reconnect hooks** to refetch stale state after a reconnect.
- 🔑 **Auth via props** — `baseUrl` and `accessTokenFactory`, gated by `enabled`. Token rotation needs no rebuild.
- 🪶 **Zero runtime deps.** Peer deps only: `react`, `react-dom`, `@microsoft/signalr`.

## 📦 Install

```bash
npm i @dammers/use-signalr @microsoft/signalr
```

Requires React 19 and `@microsoft/signalr` ≥ 8 (tested against 8–10).

## 🚀 Usage

### 1. Define your contract and create the client

The **keys of `config.hubs` declare the hubs**. Each hub's `events` (what the
server pushes to you) and `methods` (what you invoke) are declared inline with
the `event()` and `method()` markers.

```ts
// signalr.ts
import { createSignalRClient, event, method } from "@dammers/use-signalr";

export const {
  SignalRProvider,
  useSignalR,
  useSignalREffect,
  useSignalRInvoke,
  useSignalRSend,
  useSignalRTeardown,
  useHubStatus,
  useOnReconnected,
  useHubConsumer,
} = createSignalRClient({
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

`event<Args>()` takes the handler's argument tuple. `method<Args, Return>()`
takes the argument tuple and the resolved return type (default `void`).

### 2. Mount the provider with your auth

```tsx
import { SignalRProvider } from "./signalr";

<SignalRProvider
  baseUrl={serverUrl} // e.g. "https://api.example.com"
  accessTokenFactory={() => getAccessToken()} // sync or async; read on every (re)negotiate
  enabled={isAuthenticated} // optional, default true; false -> stops + clears all connections
  connectionKey={accessToken} // optional: forces reconnect when it changes (re-login)
  onError={(hub, err) => toast.error(`Connection to ${hub} failed`)}
  onStatusChange={(hub, status) => {
    if (status === "reconnecting") toast.warning(`Reconnecting to ${hub}…`);
    if (status === "reconnected") toast.success(`Reconnected to ${hub}`);
  }}
>
  <App />
</SignalRProvider>;
```

### 3. Use the hooks — everything below is fully typed

```tsx
// 📥 Listen to a server event — args inferred from the contract
useSignalREffect("/hubs/chat", "ReceiveMessage", (user, message) => {
  console.log(user, message);
});

// 📤 Invoke a server method — args + return inferred, waits for connection
const sendMessage = useSignalRInvoke("/hubs/chat", "SendMessage");
await sendMessage(roomId, "hello"); // typed params, Promise<void>

// 🏹 Typed fire-and-forget — does not wait for connection; drops if not connected.
// Stable across renders — safe to capture in an unmount cleanup.
const send = useSignalRSend("/hubs/chat", "SendMessage");
await send(roomId, "bye"); // typed args; Promise<boolean> (true = dispatched)

// 🚪 Reliable teardown — for a method called in an effect cleanup. Survives
// unmount, queues while the hub connects (instead of dropping), and holds a
// lazy hub open until it flushes. Best-effort: Promise<boolean> (true = dispatched).
const leaveRoom = useSignalRTeardown("/hubs/chat", "LeaveRoomAsync");
useEffect(() => {
  joinRoom(roomId);
  return () => {
    leaveRoom(roomId);
  }; // lands even mid-connect or after unmount
}, [roomId, joinRoom, leaveRoom]);

// 🟢 Live connection status — re-renders only when this hub's status changes
const status = useHubStatus("/hubs/chat"); // "connecting" | "connected" | "reconnecting" | ...

// 🔄 Re-sync after a reconnect, for example to refetch a query
useOnReconnected("/hubs/chat", () => refetchMessages());

// ⚓ Keep a lazy hub connected for this component's lifetime without subscribing
useHubConsumer("/hubs/chat");

// 🛠️ Last resort: the raw HubConnection (prefer the typed hooks above)
const { getConnection } = useSignalR();
getConnection("/hubs/chat")?.send("SendMessage", roomId, "bye");
```

## ⚙️ Per-hub config

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

### 💤 Lazy hubs

With `lazy: true`, a hub connects only when the first component that uses it mounts (any hook for that hub), and disconnects `graceMs` after the last one unmounts. Ref-counted and StrictMode-safe. Default is eager.

### 🔁 Invoke retry

`useSignalRInvoke` fails fast by default (`retries: 0`) and rethrows the raw server error. Opt in **only for idempotent methods** — a retried invoke is at-least-once:

```ts
const undo = useSignalRInvoke("/hubs/flow", "UndoAsync", {
  retries: 2, // retry RETRIABLE failures (transport drops, 5xx, timeouts)
  timeout: 15000, // per-attempt deadline
  backoff: [250, 1000, 3000], // or (attempt) => ms; capped 30s, jittered
});
```

Business errors (a `HubException` thrown while still connected) are **never** retried.

### 🚪 send vs invoke vs teardown — which call to use

The three "call the server" hooks differ in how they wait, what they return, and what happens on unmount. Pick by intent:

|                           | `useSignalRInvoke`                      | `useSignalRSend`                                | `useSignalRTeardown`             |
| ------------------------- | --------------------------------------- | ----------------------------------------------- | -------------------------------- |
| **Waits for connection**  | yes (up to `timeout`)                   | no                                              | yes (up to `timeout`)            |
| **Not connected yet**     | waits, then invokes                     | **drops** (resolves `false`)                    | **queues**, flushes on connect   |
| **Returns**               | the method's typed result               | `boolean` (dispatched?)                         | `boolean` (dispatched?)          |
| **On unmount**            | aborts in-flight call¹                  | unaffected (reads conn at call time)            | **survives** (runs detached)     |
| **Holds a lazy hub open** | while mounted                           | while mounted                                   | until the flush completes        |
| **Use for**               | request/response you need the result of | high-frequency loss-OK signals (typing, cursor) | one-shot teardown that must land |

¹ Only a mid-backoff retry is actually cancelled. Pass `{ keepAliveOnUnmount: true }` to keep it alive.

#### Reliable join/leave (session pattern)

A common pattern joins a session on mount and leaves it in the effect cleanup.

```tsx
const joinRoom = useSignalRInvoke("/hubs/chat", "JoinRoomAsync");
const leaveRoom = useSignalRTeardown("/hubs/chat", "LeaveRoomAsync");

useEffect(() => {
  joinRoom(roomId);
  return () => {
    leaveRoom(roomId);
  };
}, [roomId, joinRoom, leaveRoom]);
```

A plain `useSignalRInvoke` or `useSignalRSend` makes the **leave** unreliable:

- `useSignalRInvoke` aborts in-flight calls on unmount, so a leave issued in cleanup can be cancelled before it reaches the server.
- `useSignalRSend` drops silently if the hub is not `Connected`, so a leave that races a still-connecting socket (StrictMode's first mount, a fast route switch) is lost.

`useSignalRTeardown` fixes both problems. It:

- **survives the calling component's unmount** — it runs detached and is never aborted,
- **queues while connecting** — it waits up to `timeout` (default 10s) for the hub, then sends, instead of dropping,
- **holds a lazy hub open** until the flush completes, even if the unmounting component was its last consumer.

It is best-effort and fire-and-forget: it resolves `true` once dispatched, `false` if the hub never connected in time, and never throws. It also lands correctly under StrictMode's mount→cleanup→mount, at the cost of one extra round-trip.

> If your leave already uses `useSignalRInvoke` and only needs to avoid the abort on unmount, pass `{ keepAliveOnUnmount: true }`. This covers the abort case but **not** the still-connecting race. For that race, use `useSignalRTeardown`.

## 📚 API

| Export                                   | What it does                                                                                                                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createSignalRClient(config)`            | Returns the provider and hooks, typed against the contract **inferred** from `config`.                                                                                  |
| `event<Args>()`                          | Declares a server-pushed event inside a hub's `events`. `Args` is the handler's argument tuple.                                                                         |
| `method<Args, Return?>()`                | Declares an invocable server method inside a hub's `methods`. `Args` is the argument tuple; `Return` is the resolved return type (default `void`).                      |
| `<SignalRProvider>`                      | Builds and starts connections, retries, and auto-reconnects.                                                                                                            |
| `useSignalREffect(hub, event, handler)`  | Subscribes to a server event for the component's lifetime.                                                                                                              |
| `useSignalRInvoke(hub, method, opts?)`   | Typed request/response invoker. Waits for the connection and returns the method's result. Optional retry/backoff/timeout; `keepAliveOnUnmount` skips the unmount abort. |
| `useSignalRSend(hub, method)`            | Typed fire-and-forget sender. **Drops** if not connected. For high-frequency signals where loss is acceptable. Safe in unmount cleanups.                                |
| `useSignalRTeardown(hub, method, opts?)` | Reliable teardown sender for a method called in cleanup: survives unmount, **queues** while connecting instead of dropping, and holds a lazy hub open until flushed.    |
| `useHubStatus(hub)`                      | Live connection status. Re-renders only when that hub changes.                                                                                                          |
| `useOnReconnected(hub, cb)`              | Runs `cb` after the hub reconnects, for example to refetch.                                                                                                             |
| `useHubConsumer(hub)`                    | Keeps a lazy hub connected for the component's lifetime without subscribing.                                                                                            |
| `useSignalR()`                           | Last-resort raw context: `getConnection`, `isHubConnected`, `getStatus`.                                                                                                |

### Provider props

Required: `baseUrl`, `accessTokenFactory`. Optional: `enabled` (default `true`), `connectionKey`, `onStatusChange`, `onError`. Connection behavior (`lazy`, `reconnect`, `maxConnectRetries`, `logLevel`, per-hub overrides) lives in the **config** passed to `createSignalRClient`, not on the provider.

## 📝 Notes

- The provider rebuilds connections when `baseUrl`, `enabled`, or `connectionKey` change. Token _rotation_ alone does **not** trigger a rebuild — `accessTokenFactory` is re-read on every negotiate.
- `accessTokenFactory` and the `on*` callbacks always see your latest props. Passing a fresh closure each render is fine — it causes no reconnect storm, so you do not need to memoize them.

## 🤝 Contributing

Setup, scripts, and workflow live in [CONTRIBUTING.md](./CONTRIBUTING.md).

## 📄 License

[MIT](./LICENSE) © [DammersCode](https://github.com/DammersCode)
