# 🔌 @dammers/use-signalr

> Fully-typed, reusable [SignalR](https://learn.microsoft.com/aspnet/core/signalr) provider + hooks for React — driven entirely by **your** contract.

[![npm](https://img.shields.io/npm/v/@dammers/use-signalr.svg)](https://www.npmjs.com/package/@dammers/use-signalr)
[![types](https://img.shields.io/badge/types-included-blue.svg)](#-api)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

```ts
const { SignalRProvider, useSignalRInvoke } = createSignalRClient<AppHubs>({ hubs: { "/hubs/chat": {} } });
```

One factory call gives you a provider and a set of hooks, every one of them typed against your hub contract — event args, method args and return values are all inferred.

---

## ✨ Features

- 🌐 **Many hubs, one provider.** Manage any number of hubs side by side — each gets its own connection, status, config and lifecycle. List them as keys; the hooks take the hub you want.
- 🧠 **Fully typed from your contract.** Event args, method args and return values are inferred per hub. No `declare module`, no globals.
- ⚙️ **Per-hub & global config.** Set defaults once, override anything per hub: reconnect strategy, retries, transport, logging, lazy behavior.
- ♻️ **Auto-reconnect.** Built-in: `true`, a custom delay array, or your own retry policy. Plus a connect-retry budget for the first connect.
- 🔁 **Invoke retry.** Opt-in per call, idempotent-safe, with jittered backoff and smart retriable-vs-business-error detection.
- 💤 **Lazy hubs.** Connect on first use, disconnect (after a grace period) on last unmount. Ref-counted and StrictMode-safe.
- 🟢 **Live per-hub status.** Subscribe to a hub's connection state; components re-render only when *that* hub changes.
- 🔄 **Reconnect hooks.** Run a callback after a hub reconnects — e.g. refetch state that went stale.
- 🔑 **Auth via props.** Pass `baseUrl` + `accessTokenFactory` + `enabled`; the token is re-read on every negotiate, so rotation needs no rebuild.
- 🪶 **Zero runtime deps.** Only peer deps: `react`, `react-dom`, `@microsoft/signalr`.

## 📦 Install

```bash
npm i @dammers/use-signalr @microsoft/signalr
```

Peer deps: `react` ≥ 19, `react-dom` ≥ 19, `@microsoft/signalr` ≥ 8 (tested against 8–10).
React 19 is required — the library uses the `use` hook and JSX context providers.

## 🚀 Usage

### 1. Define your contract and create the client

`events` = what the server pushes to you; `methods` = what you invoke. The **keys of `config.hubs` declare the hubs**.

```ts
// signalr.ts
import { createSignalRClient } from "@dammers/use-signalr";

type AppHubs = {
  "/hubs/chat": {
    events: {
      ReceiveMessage: (user: string, message: string) => void;
    };
    methods: {
      SendMessage: (roomId: string, message: string) => Promise<void>;
      JoinRoom: (roomId: string) => Promise<{ success: boolean }>;
    };
  };
};

export const {
  SignalRProvider,
  useSignalR,
  useSignalREffect,
  useSignalRInvoke,
  useSignalRSend,
  useHubStatus,
  useOnReconnected,
  useHubConsumer,
} = createSignalRClient<AppHubs>({
  hubs: {
    "/hubs/chat": {}, // per-hub config goes here (see "Per-hub config")
  },
  // global defaults (all optional):
  // lazy: false, reconnect: true, maxConnectRetries: 2, logLevel: LogLevel.Information
});
```

### 2. Mount the provider with your auth

The provider takes **no hubs prop** — it already knows them from the config.

```tsx
import { SignalRProvider } from "./signalr";

<SignalRProvider
  baseUrl={serverUrl}                          // e.g. "https://api.example.com"
  accessTokenFactory={() => getAccessToken()}  // sync or async; read on every (re)negotiate
  enabled={isAuthenticated}                    // false -> stops + clears all connections
  connectionKey={accessToken}                  // optional: forces reconnect when it changes (re-login)
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

// 🏹 Typed fire-and-forget — no connect-wait, dropped if the hub isn't connected.
// Stable across renders, so it's safe to capture in an unmount cleanup.
const send = useSignalRSend("/hubs/chat", "SendMessage");
await send(roomId, "bye"); // typed args; Promise<boolean> (true = dispatched)

// 🟢 Live connection status (re-renders only when THIS hub's status changes)
const status = useHubStatus("/hubs/chat"); // "connecting" | "connected" | "reconnecting" | ...

// 🔄 Re-sync after a reconnect (e.g. refetch a query)
useOnReconnected("/hubs/chat", () => refetchMessages());

// ⚓ Keep a lazy hub connected for this component's lifetime without subscribing
useHubConsumer("/hubs/chat");

// 🛠️ Last resort: the raw HubConnection (prefer the typed hooks above)
const { getConnection } = useSignalR();
getConnection("/hubs/chat")?.send("SendMessage", roomId, "bye");
```

## ⚙️ Per-hub config

Each value in `config.hubs` overrides the global defaults for that hub:

```ts
createSignalRClient<AppHubs>({
  hubs: {
    "/hubs/chat": {},                            // all defaults
    "/hubs/presence": {
      lazy: true,                                // connect only when first used
      graceMs: 5000,                             // wait 5s after last consumer before disconnect
      reconnect: [0, 2000, 10000, 30000],        // custom retry delays (ms)
      maxConnectRetries: 5,
      transport: HttpTransportType.WebSockets,
      skipNegotiation: true,
    },
  },
  lazy: false,          // global default for all hubs
  reconnect: true,      // true | false | number[] | IRetryPolicy
  maxConnectRetries: 2,
});
```

### 💤 Lazy hubs

With `lazy: true`, a hub connects only when the first component using it mounts (any hook for that hub) and disconnects `graceMs` after the last one unmounts. Ref-counted and StrictMode-safe. Default is eager.

### 🔁 Invoke retry

`useSignalRInvoke` fails fast by default (`retries: 0`, rethrows the raw server error). Opt in **only for idempotent methods** — a retried invoke is at-least-once:

```ts
const undo = useSignalRInvoke("/hubs/flow", "UndoAsync", {
  retries: 2,                       // retry RETRIABLE failures (transport drops, 5xx, timeouts)
  timeout: 15000,                   // per-attempt deadline
  backoff: [250, 1000, 3000],       // or (attempt) => ms; capped 30s, jittered
});
```

Business errors (a `HubException` thrown while still connected) are **never** retried.

## 📚 API

| Export | What it does |
| --- | --- |
| `createSignalRClient<T>(config)` | Returns the Provider + hooks bound to contract `T`. Config keys declare the hubs. |
| `<SignalRProvider>` | Builds/starts connections, retries, auto-reconnects, exposes them via context. No `hubs` prop. |
| `useSignalREffect(hub, event, handler)` | Subscribe to a server event for the component lifetime. |
| `useSignalRInvoke(hub, method, opts?)` | Typed invoker; waits for the connection. Optional retry/backoff/timeout. |
| `useSignalRSend(hub, method)` | Typed fire-and-forget sender; drops if not connected. Safe in unmount cleanups. |
| `useHubStatus(hub)` | Live connection status; re-renders only when that hub changes. |
| `useOnReconnected(hub, cb)` | Run `cb` after the hub reconnects (e.g. refetch). |
| `useHubConsumer(hub)` | Keep a lazy hub connected for the component's lifetime without subscribing. |
| `useSignalR()` | Last-resort raw context: `getConnection`, `isHubConnected`, `getStatus`. |

### Provider props

`baseUrl`, `accessTokenFactory`, `enabled` (required); `connectionKey`, `onStatusChange`, `onError` (optional). Connection behavior (`lazy`, `reconnect`, `maxConnectRetries`, `logLevel`, per-hub overrides) lives in the **config** passed to `createSignalRClient`, not on the provider.

## 📝 Notes

- The provider rebuilds connections when `baseUrl`, `enabled`, or `connectionKey` change. Token *rotation* alone does **not** rebuild — `accessTokenFactory` is re-read on every negotiate.
- `accessTokenFactory` and the `on*` callbacks are read through refs, so passing fresh closures each render is fine — no reconnect storm.

## 🤝 Contributing

Setup, scripts and workflow live in [CONTRIBUTING.md](./CONTRIBUTING.md). Maintainer release steps are in [PUBLISHING.md](./PUBLISHING.md).

## 📄 License

[MIT](./LICENSE) © [DammersCode](https://github.com/DammersCode)
