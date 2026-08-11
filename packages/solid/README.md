# @dammers/use-signalr-solid

A typed, reusable [SignalR](https://learn.microsoft.com/aspnet/core/signalr) provider and hook set for SolidJS, driven by your contract.

[![npm](https://img.shields.io/npm/v/@dammers/use-signalr-solid.svg)](https://www.npmjs.com/package/@dammers/use-signalr-solid)
![types](https://img.shields.io/badge/types-included-blue.svg)
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

Shared concepts (the contract, per-hub config, invoke retry, send vs invoke vs teardown) are covered in the [root README](https://github.com/DammersCode/use-signalr#readme). This document covers Solid-specific install and usage.

## Install

```bash
npm i @dammers/use-signalr-solid @microsoft/signalr
```

Requires `solid-js` ≥ 1.7 and `@microsoft/signalr` ≥ 8 (tested against 8–10).

## Usage

### 1. Define your contract and create the client

The **keys of `config.hubs` declare the hubs**. Each hub's `events` (what the server pushes to you) and `methods` (what you invoke) are declared inline with the `event()` and `method()` markers. This is the same contract shape as the React package — only the provider and hooks below differ.

```ts
// signalr.ts
import { createSignalRClient, event, method } from "@dammers/use-signalr-solid";

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
  enabled={isAuthenticated()} // optional, default true; false -> stops + clears all connections
  connectionKey={accessToken()} // optional: forces reconnect when it changes (re-login)
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

The hooks are called the same way as in the React package, with one difference: **`useHubStatus` returns an accessor**, not a plain value. Call it to read the current status, same as any other Solid signal.

```tsx
// Listen to a server event — args inferred from the contract
useSignalREffect("/hubs/chat", "ReceiveMessage", (user, message) => {
  console.log(user, message);
});

// Invoke a server method — args + return inferred, waits for connection
const sendMessage = useSignalRInvoke("/hubs/chat", "SendMessage");
await sendMessage(roomId, "hello"); // typed params, Promise<void>

// Typed fire-and-forget — does not wait for connection; drops if not connected.
// Safe to capture in an onCleanup.
const send = useSignalRSend("/hubs/chat", "SendMessage");
await send(roomId, "bye"); // typed args; Promise<boolean> (true = dispatched)

// Reliable teardown — for a method called in onCleanup. Survives disposal,
// queues while the hub connects (instead of dropping), and holds a lazy hub
// open until it flushes. Best-effort: Promise<boolean> (true = dispatched).
const leaveRoom = useSignalRTeardown("/hubs/chat", "LeaveRoomAsync");
onMount(() => {
  joinRoom(roomId);
  onCleanup(() => {
    leaveRoom(roomId);
  }); // lands even mid-connect or after disposal
});

// Live connection status, as an accessor — call status() to read it, e.g. in JSX
const status = useHubStatus("/hubs/chat");
return <p>Status: {status()}</p>;
// status() is "connecting" | "connected" | "reconnecting" | ...

// Re-sync after a reconnect, for example to refetch a query
useOnReconnected("/hubs/chat", () => refetchMessages());

// Keep a lazy hub connected for this component's lifetime without subscribing
useHubConsumer("/hubs/chat");

// Last resort: the raw HubConnection (prefer the typed hooks above)
const { getConnection } = useSignalR();
getConnection("/hubs/chat")?.send("SendMessage", roomId, "bye");
```

### Reliable join/leave (session pattern)

A common pattern joins a session on setup and leaves it in `onCleanup`.

```tsx
const joinRoom = useSignalRInvoke("/hubs/chat", "JoinRoomAsync");
const leaveRoom = useSignalRTeardown("/hubs/chat", "LeaveRoomAsync");

onMount(() => {
  joinRoom(roomId());
  onCleanup(() => {
    leaveRoom(roomId());
  });
});
```

A plain `useSignalRInvoke` or `useSignalRSend` makes the **leave** unreliable:

- `useSignalRInvoke` aborts in-flight calls on cleanup, so a leave issued in `onCleanup` can be cancelled before it reaches the server.
- `useSignalRSend` drops silently if the hub is not `Connected`, so a leave that races a still-connecting socket (a fast route switch, a rapid mount/unmount) is lost.

`useSignalRTeardown` fixes both problems. It:

- **survives the calling component's disposal** — it runs detached and is never aborted,
- **queues while connecting** — it waits up to `timeout` (default 10s) for the hub, then sends, instead of dropping,
- **holds a lazy hub open** until the flush completes, even if the disposing component was its last consumer.

It is best-effort and fire-and-forget: it resolves `true` once dispatched, `false` if the hub never connected in time, and never throws.

> If your leave already uses `useSignalRInvoke` and only needs to avoid the abort on cleanup, pass `{ keepAliveOnUnmount: true }`. This covers the abort case but **not** the still-connecting race. For that race, use `useSignalRTeardown`.

## SSR (SolidStart)

The import is server-safe. No connection work happens at module scope or during a server render.

`SignalRProvider` starts connections inside `createEffect`, which does not run during SSR. Every hub reports `"disconnected"` until that effect runs in the browser.

## Lazy hubs and `graceMs`

Set `lazy: true` on a hub to connect it only when the first hook for that hub is set up. Consumers are ref-counted.

After the last consumer is torn down, the connection stays open for `graceMs` milliseconds. If a new consumer appears inside that window, the connection stays. The default is `0`.

```ts
createSignalRClient({
  hubs: {
    "/hubs/presence": { lazy: true, graceMs: 5000 },
  },
});
```

## `InvokeError`

`useSignalRInvoke` throws `InvokeError` when its retry budget is exhausted. The error carries `cause` (the last underlying error), `attempts` (the total number of attempts), and `retriable` (whether the final failure was classed as retriable).

`InvokeError` is thrown only when you set `retries` above `0`. With the default `retries: 0`, the raw server error propagates unchanged.

The `timeout` option bounds only the wait for a connected hub before dispatch. SignalR cannot cancel an invocation after dispatch.

## Solid-specific behavior

- **`useHubStatus` returns an `Accessor<HubConnectionStatus>`.** A Solid component body runs once, so a hook cannot return a plain value that updates later — it has to return something callable that a tracking scope (JSX, a `createEffect`) reads on its own. Call it — `status()` — every time you need the current value.
- **Hub, event, method names and the options object are read once, at setup.** They are not reactive. If you need a different hub or method for different state, call the hook again for each variant, or restructure by key (for example with `<For>` / `<Switch>`), rather than expecting the hook to react to a changed argument.
- **Handlers are live closures.** `useSignalREffect`'s handler and `useOnReconnected`'s callback are captured once, but a Solid closure reads signals live — so the handler always sees current values. Memoization is never needed.
- **Join/leave uses `onMount` / `onCleanup`**, not an effect with a dependency array — Solid has no dependency arrays. `onMount` runs once after the initial render; `onCleanup` runs on disposal.

## More

Per-hub config, invoke retry semantics, the send/invoke/teardown comparison, and notes on token rotation live in the [root README](https://github.com/DammersCode/use-signalr#readme). Contributing setup lives in [CONTRIBUTING.md](https://github.com/DammersCode/use-signalr/blob/main/CONTRIBUTING.md).

## License

MIT © [DammersCode](https://github.com/DammersCode)
