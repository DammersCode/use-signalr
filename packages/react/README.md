# @dammers/use-signalr-react

A typed, reusable [SignalR](https://learn.microsoft.com/aspnet/core/signalr) provider and hook set for React, driven by your contract.

[![npm](https://img.shields.io/npm/v/@dammers/use-signalr-react.svg)](https://www.npmjs.com/package/@dammers/use-signalr-react)
[![types](https://img.shields.io/badge/types-included-blue.svg)](#api)
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

Shared concepts (the contract, per-hub config, invoke retry, send vs invoke vs teardown) are covered in the [root README](https://github.com/DammersCode/use-signalr#readme). This document covers React-specific install and usage.

## Install

```bash
npm i @dammers/use-signalr-react @microsoft/signalr
```

Requires React ≥ 19 and `@microsoft/signalr` ≥ 8 (tested against 8–10).

## Usage

### 1. Define your contract and create the client

The **keys of `config.hubs` declare the hubs**. Each hub's `events` (what the server pushes to you) and `methods` (what you invoke) are declared inline with the `event()` and `method()` markers.

```ts
// signalr.ts
import { createSignalRClient, event, method } from "@dammers/use-signalr-react";

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
      // per-hub config also goes here (see the root README)
    },
  },
  // global defaults (all optional):
  // lazy: false, reconnect: true, maxConnectRetries: 2, logLevel: LogLevel.Information
});
```

`event<Args>()` takes the handler's argument tuple. `method<Args, Return>()` takes the argument tuple and the resolved return type (default `void`).

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
// Listen to a server event — args inferred from the contract
useSignalREffect("/hubs/chat", "ReceiveMessage", (user, message) => {
  console.log(user, message);
});

// Invoke a server method — args + return inferred, waits for connection
const sendMessage = useSignalRInvoke("/hubs/chat", "SendMessage");
await sendMessage(roomId, "hello"); // typed params, Promise<void>

// Typed fire-and-forget — does not wait for connection; drops if not connected.
// Stable across renders — safe to capture in an unmount cleanup.
const send = useSignalRSend("/hubs/chat", "SendMessage");
await send(roomId, "bye"); // typed args; Promise<boolean> (true = dispatched)

// Reliable teardown — for a method called in an effect cleanup. Survives
// unmount, queues while the hub connects (instead of dropping), and holds a
// lazy hub open until it flushes. Best-effort: Promise<boolean> (true = dispatched).
const leaveRoom = useSignalRTeardown("/hubs/chat", "LeaveRoomAsync");
useEffect(() => {
  joinRoom(roomId);
  return () => {
    leaveRoom(roomId);
  }; // lands even mid-connect or after unmount
}, [roomId, joinRoom, leaveRoom]);

// Live connection status — re-renders only when this hub's status changes
const status = useHubStatus("/hubs/chat"); // "connecting" | "connected" | "reconnecting" | ...

// Re-sync after a reconnect, for example to refetch a query
useOnReconnected("/hubs/chat", () => refetchMessages());

// Keep a lazy hub connected for this component's lifetime without subscribing
useHubConsumer("/hubs/chat");

// Last resort: the raw HubConnection (prefer the typed hooks above)
const { getConnection } = useSignalR();
getConnection("/hubs/chat")?.send("SendMessage", roomId, "bye");
```

### Reliable join/leave (session pattern)

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

## API

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

## More

Per-hub config, invoke retry semantics, the send/invoke/teardown comparison, and notes on token rotation live in the [root README](https://github.com/DammersCode/use-signalr#readme). Contributing setup lives in [CONTRIBUTING.md](https://github.com/DammersCode/use-signalr/blob/main/CONTRIBUTING.md).

## License

MIT © [DammersCode](https://github.com/DammersCode)
