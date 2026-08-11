# @dammers/use-signalr-svelte

A typed, reusable [SignalR](https://learn.microsoft.com/aspnet/core/signalr) provider and store set for Svelte, driven by your contract.

[![npm](https://img.shields.io/npm/v/@dammers/use-signalr-svelte.svg)](https://www.npmjs.com/package/@dammers/use-signalr-svelte)
![types](https://img.shields.io/badge/types-included-blue.svg)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

```ts
const { provideSignalR, hubInvoke } = createSignalRClient({
  hubs: {
    "/hubs/chat": {
      methods: { SendMessage: method<[roomId: string, message: string]>() },
    },
  },
});
```

One factory call returns a provider function and a set of stores/functions, each typed against your hub contract. Event args, method args, and return values are all inferred from the config.

Shared concepts (the contract, per-hub config, invoke retry, send vs invoke vs teardown) are covered in the [root README](https://github.com/DammersCode/use-signalr#readme). This document covers Svelte-specific install and usage.

## Install

```bash
npm i @dammers/use-signalr-svelte @microsoft/signalr
```

Requires `svelte` ≥ 4 and `@microsoft/signalr` ≥ 8 (tested against 8–10).

## Usage

### 1. Define your contract and create the client

The **keys of `config.hubs` declare the hubs**. Each hub's `events` (what the server pushes to you) and `methods` (what you invoke) are declared inline with the `event()` and `method()` markers. This is the same contract shape as the React and Solid packages — only the provider and the functions below differ.

```ts
// signalr.ts
import { createSignalRClient, event, method } from "@dammers/use-signalr-svelte";

export const {
  provideSignalR,
  getSignalR,
  onHubEvent,
  hubInvoke,
  hubSend,
  hubTeardown,
  hubStatus,
  onReconnected,
  keepHubAlive,
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

### 2. Provide the connection in your root layout

`provideSignalR` is a **function**, not a component — call it once in your root component's `<script>`, before any other function from this client. In SvelteKit, that means `+layout.svelte`.

```svelte
<!-- +layout.svelte -->
<script lang="ts">
  import { provideSignalR } from "$lib/signalr";
  import { accessToken, isAuthenticated } from "$lib/auth";

  let { children } = $props();

  provideSignalR({
    baseUrl: "https://api.example.com",
    accessTokenFactory: () => accessToken(),
    enabled: isAuthenticated, // optional, default true; can be a store or a plain value
    onError: (hub, err) => console.error(`Connection to ${hub} failed`, err),
    onStatusChange: (hub, status) => {
      if (status === "reconnecting") console.warn(`Reconnecting to ${hub}…`);
    },
  });
</script>

{@render children()}
```

All connection work happens client-side only — `provideSignalR` is safe to call during SSR, since it defers building any connection until the component mounts in the browser.

### 3. Use the exported stores/functions — everything below is fully typed

These work the same way as the React and Solid packages' hooks, with one difference: **`hubStatus` returns a Svelte store**, not a plain value. Read it with the `$` prefix in a component.

```svelte
<script lang="ts">
  import { onDestroy } from "svelte";
  import {
    onHubEvent,
    hubInvoke,
    hubSend,
    hubTeardown,
    hubStatus,
    onReconnected,
    keepHubAlive,
    getSignalR,
  } from "$lib/signalr";

  // Listen to a server event — args inferred from the contract
  onHubEvent("/hubs/chat", "ReceiveMessage", (user, message) => {
    console.log(user, message);
  });

  // Invoke a server method — args + return inferred, waits for connection
  const sendMessage = hubInvoke("/hubs/chat", "SendMessage");
  await sendMessage(roomId, "hello"); // typed params, Promise<void>

  // Typed fire-and-forget — does not wait for connection; drops if not connected.
  // Safe to capture in onDestroy.
  const send = hubSend("/hubs/chat", "SendMessage");
  await send(roomId, "bye"); // typed args; Promise<boolean> (true = dispatched)

  // Reliable teardown — for a method called in onDestroy. Survives disposal,
  // queues while the hub connects (instead of dropping), and holds a lazy hub
  // open until it flushes. Best-effort: Promise<boolean> (true = dispatched).
  const joinRoom = hubInvoke("/hubs/chat", "JoinRoomAsync");
  const leaveRoom = hubTeardown("/hubs/chat", "LeaveRoomAsync");
  joinRoom(roomId);
  onDestroy(() => {
    leaveRoom(roomId);
  }); // lands even mid-connect or after disposal

  // Live connection status, as a Svelte store
  const status = hubStatus("/hubs/chat");

  // Re-sync after a reconnect, for example to refetch a query
  onReconnected("/hubs/chat", () => refetchMessages());

  // Keep a lazy hub connected for this component's lifetime without subscribing
  keepHubAlive("/hubs/chat");

  // Last resort: the raw HubConnection (prefer the typed stores/functions above)
  const { getConnection } = getSignalR();
  getConnection("/hubs/chat")?.send("SendMessage", roomId, "bye");
</script>

<p>Status: {$status}</p>
```

### Reliable join/leave (session pattern)

A common pattern joins a session on init and leaves it in `onDestroy`.

```svelte
<script lang="ts">
  import { onDestroy } from "svelte";

  const joinRoom = hubInvoke("/hubs/chat", "JoinRoomAsync");
  const leaveRoom = hubTeardown("/hubs/chat", "LeaveRoomAsync");

  joinRoom(roomId);
  onDestroy(() => {
    leaveRoom(roomId);
  });
</script>
```

A plain `hubInvoke` or `hubSend` makes the **leave** unreliable:

- `hubInvoke` aborts in-flight calls on destroy, so a leave issued in `onDestroy` can be cancelled before it reaches the server.
- `hubSend` drops silently if the hub is not `Connected`, so a leave that races a still-connecting socket (a fast route change, a rapid mount/unmount) is lost.

`hubTeardown` fixes both problems. It:

- **survives the calling component's disposal** — it runs detached and is never aborted,
- **queues while connecting** — it waits up to `timeout` (default 10s) for the hub, then sends, instead of dropping,
- **holds a lazy hub open** until the flush completes, even if the disposing component was its last consumer.

It is best-effort and fire-and-forget: it resolves `true` once dispatched, `false` if the hub never connected in time, and never throws.

> If your leave already uses `hubInvoke` and only needs to avoid the abort on destroy, pass `{ keepAliveOnUnmount: true }`. This covers the abort case but **not** the still-connecting race. For that race, use `hubTeardown`.

## Svelte-specific behavior

- **`provideSignalR` is a function, not a component.** Call it directly in a `<script>` block during component initialization — most commonly your root layout — instead of wrapping markup in a provider component.
- **`hubStatus` returns a `Readable<HubConnectionStatus>`.** Read the current value with `$status` in markup, or call `.subscribe(...)` directly for more control. This works the same in Svelte 4 and Svelte 5.
- **`baseUrl`, `enabled`, and `connectionKey` accept a `MaybeReadable<T>`** — either a plain value or a Svelte store (`Readable<T>`). Passing a store makes the provider react to it: the connection rebuilds whenever the store's value changes, exactly as if you had passed a new plain value.
- **Hub, event, method names and the options object are read once, during component init.** They are not reactive. If you need a different hub or method for different state, call the function again for each variant rather than expecting it to react to a changed argument.
- **Handlers are live closures.** `onHubEvent`'s handler and `onReconnected`'s callback are captured once, but a normal JS closure sees current values from your component's scope. Memoization is never needed.
- **Join/leave uses component init + `onDestroy`**, imported directly from `"svelte"`. `onDestroy` runs once when the component is destroyed.
- **All connection work is client-side only.** `provideSignalR` defers connecting until the component mounts in the browser (`onMount`, which never runs during SSR), so it is safe to call from a SvelteKit `+layout.svelte` without any SSR guard.

## More

Per-hub config, invoke retry semantics, the send/invoke/teardown comparison, and notes on token rotation live in the [root README](https://github.com/DammersCode/use-signalr#readme). Contributing setup lives in [CONTRIBUTING.md](https://github.com/DammersCode/use-signalr/blob/main/CONTRIBUTING.md).

## License

MIT © [DammersCode](https://github.com/DammersCode)
