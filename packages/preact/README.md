# @dammers/use-signalr-preact

A typed SignalR provider and hook set for Preact. It supports multiple hubs, lazy hubs, reconnect, retry, status, send, and teardown calls.

[![npm](https://img.shields.io/npm/v/@dammers/use-signalr-preact.svg)](https://www.npmjs.com/package/@dammers/use-signalr-preact)
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

One factory call returns a provider and hooks. Each member uses types inferred from your hub contract.

The [root README](https://github.com/DammersCode/use-signalr#readme) documents shared configuration and call behavior. This document covers Preact-specific installation and usage.

## Install

```bash
npm i @dammers/use-signalr-preact @microsoft/signalr preact
```

This package requires Preact 10 or later. It does not require `preact/compat`.

## Usage

### 1. Create the client

```ts
// signalr.ts
import { createSignalRClient, event, method } from "@dammers/use-signalr-preact";

export const signalR = createSignalRClient({
  hubs: {
    "/hubs/chat": {
      events: {
        ReceiveMessage: event<[user: string, message: string]>(),
      },
      methods: {
        JoinRoom: method<[roomId: string], { success: boolean }>(),
        LeaveRoom: method<[roomId: string]>(),
      },
      // lazy: true,
    },
  },
});
```

The hub keys declare the hubs. `event()` declares server event arguments. `method()` declares method arguments and the return type.

### 2. Add the provider

```tsx
import { render } from "preact";
import { signalR } from "./signalr";
import { App } from "./app";

render(
  <signalR.SignalRProvider
    baseUrl="https://api.example.com"
    accessTokenFactory={() => getAccessToken()}
    enabled={isAuthenticated}
    connectionKey={accessToken}
    onError={(hub, error) => console.error(hub, error)}
  >
    <App />
  </signalR.SignalRProvider>,
  document.getElementById("app")!,
);
```

`baseUrl` and `accessTokenFactory` are required. `enabled` defaults to `true`. Set `enabled` to `false` to stop all hubs. Change `connectionKey` to rebuild connections. The token factory runs for each negotiate request. A token change alone does not rebuild a connection.

## Connection config

Set shared connection options when you create the client. Set an option in a hub to override the shared value.

```ts
createSignalRClient({
  lazy: false,
  reconnect: true,
  maxConnectRetries: 2,
  hubs: {
    "/hubs/chat": { lazy: true, graceMs: 250 },
  },
});
```

`lazy: true` waits for a consumer before it connects. `graceMs` delays the final stop. `reconnect` enables SignalR reconnect. `maxConnectRetries` controls initial connection retry.

### 3. Use the hooks

```tsx
const status = signalR.useHubStatus("/hubs/chat");

signalR.useSignalREffect("/hubs/chat", "ReceiveMessage", (user, message) => {
  console.log(user, message);
});

const join = signalR.useSignalRInvoke("/hubs/chat", "JoinRoom", { retries: 2 });
const leave = signalR.useSignalRTeardown("/hubs/chat", "LeaveRoom");
const send = signalR.useSignalRSend("/hubs/chat", "LeaveRoom");
```

`useSignalR` returns the raw context. `useHubConsumer` keeps a lazy hub alive. `useHubStatus` updates only for its hub. `useSignalREffect` attaches an event handler and reattaches after reconnect. `useOnReconnected` runs a callback after reconnect.

`useSignalRInvoke` waits for a connection and returns the server result. It aborts retry work at unmount unless `keepAliveOnUnmount` is true. Enable retries only for idempotent methods.

`useSignalRSend` does not wait for a connection. It returns `false` when the hub is disconnected. It returns `true` after it sends a call.

`useSignalRTeardown` is for cleanup code. It survives unmount and waits for a connection. It holds a lazy hub until the call finishes. It returns `false` after its timeout.

## Reliable join and leave

Use `useSignalRInvoke` to join. Use `useSignalRTeardown` to leave during cleanup. A teardown call remains active after the component unmounts.

```tsx
const join = signalR.useSignalRInvoke("/hubs/chat", "JoinRoom");
const leave = signalR.useSignalRTeardown("/hubs/chat", "LeaveRoom");

useEffect(() => {
  void join(roomId);
  return () => { void leave(roomId); };
}, [roomId, join, leave]);
```

Do not use `useSignalRSend` for a required leave. It drops a call when the hub is disconnected.

## Preact-specific behavior

- The adapter imports `preact` and `preact/hooks` directly.
- `preact/compat` is not required.
- One mounted provider owns one core session. Its descendants share each hub connection.
- Status subscriptions are keyed by hub. A change to hub B does not render a hub A consumer.
- Effects release event listeners and lazy references when a component unmounts.
- A new callback identity updates a ref. It does not reconnect or attach another event listener.
- The provider starts connections in `useEffect`. Server rendering does not start a connection.

## API

| Export | Description |
| --- | --- |
| `createSignalRClient(config)` | Creates the typed provider and hooks. |
| `event<Args>()` | Declares a server event. |
| `method<Args, Return>()` | Declares a hub method. |
| `SignalRProvider` | Starts and stops configured connections. |
| `useSignalR()` | Returns the raw SignalR context. |
| `useHubConsumer(hub)` | Keeps a lazy hub alive. |
| `useSignalREffect(hub, event, handler)` | Subscribes to a typed server event. |
| `useSignalRInvoke(hub, method, options?)` | Invokes a typed hub method. |
| `useSignalRSend(hub, method)` | Sends a lossy typed call. |
| `useSignalRTeardown(hub, method, options?)` | Sends a reliable cleanup call. |
| `useHubStatus(hub)` | Returns the live status for one hub. |
| `useOnReconnected(hub, callback)` | Runs a callback after reconnect. |

## Why a native Preact adapter

The React adapter can run through `preact/compat`. That route requires aliases for `react`, `react-dom`, and the JSX runtime. The [Preact compatibility guide](https://preactjs.com/guide/v10/getting-started#aliasing-react-to-preact) documents these aliases.

This package does not need those aliases. It also does not include React or `preact/compat` in its dependency path. The final bundle size depends on your bundler and application.

The provider uses Preact effects. It does not start a connection during server rendering. It creates one session for each mounted provider. All children of that provider share its hubs.

### Provider props

Required: `baseUrl`, `accessTokenFactory`.

Optional: `enabled` (default `true`), `connectionKey`, `onStatusChange`, `onError`.

Connection behavior belongs in the configuration passed to `createSignalRClient`.

## More

Read the [root README](https://github.com/DammersCode/use-signalr#readme) for hub options, retry rules, and send versus teardown behavior. Read [CONTRIBUTING.md](https://github.com/DammersCode/use-signalr/blob/main/CONTRIBUTING.md) to contribute.

## License

MIT © DammersCode
