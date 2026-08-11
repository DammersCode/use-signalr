# @dammers/use-signalr-vue

A typed, reusable [SignalR](https://learn.microsoft.com/aspnet/core/signalr) plugin and composable set for Vue 3, driven by your contract.

[![npm](https://img.shields.io/npm/v/@dammers/use-signalr-vue.svg)](https://www.npmjs.com/package/@dammers/use-signalr-vue)
[![types](https://img.shields.io/badge/types-included-blue.svg)](#api)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

```ts
const signalR = createSignalRClient({
  hubs: {
    "/hubs/chat": {
      methods: { SendMessage: method<[roomId: string, message: string]>() },
    },
  },
});
```

One factory call returns a Vue plugin and composables. Each member uses types inferred from your hub contract.

The [root README](https://github.com/DammersCode/use-signalr#readme) documents shared configuration and call behavior. This document covers Vue-specific installation and usage.

## Install

```bash
npm i @dammers/use-signalr-vue @microsoft/signalr
```

Requires Vue ≥ 3.3 and `@microsoft/signalr` ≥ 8.

## Usage

### 1. Define your contract and create the client

The **keys of `config.hubs` declare the hubs**. Declare server events and methods inline with `event()` and `method()`.

```ts
// signalr.ts
import { createSignalRClient, event, method } from "@dammers/use-signalr-vue";

export const signalR = createSignalRClient({
  hubs: {
    "/hubs/chat": {
      events: {
        ReceiveMessage: event<[user: string, message: string]>(),
      },
      methods: {
        SendMessage: method<[roomId: string, message: string]>(),
        JoinRoomAsync: method<[roomId: string], { success: boolean }>(),
        LeaveRoomAsync: method<[roomId: string]>(),
      },
      // per-hub config also goes here (see the root README)
    },
  },
  // global defaults (all optional):
  // lazy: false, reconnect: true, maxConnectRetries: 2, logLevel: LogLevel.Information
});

export const {
  useSignalR,
  useSignalREvent,
  useSignalRInvoke,
  useSignalRSend,
  useSignalRTeardown,
  useHubStatus,
  useOnReconnected,
  useHubConsumer,
} = signalR;
```

`event<Args>()` takes the handler argument tuple. `method<Args, Return>()` takes the argument tuple and resolved return type.

### 2. Install the plugin with your authentication

```ts
// main.ts
import { computed, createApp, ref } from "vue";
import App from "./App.vue";
import { signalR } from "./signalr";

const token = ref("");
const enabled = computed(() => token.value.length > 0);

createApp(App)
  .use(signalR, {
    baseUrl: import.meta.env.VITE_API_URL,
    accessTokenFactory: () => token.value,
    enabled,
    onError: (hub, error) => console.error(`Connection to ${hub} failed`, error),
    onStatusChange: (hub, status) => {
      if (status === "reconnecting") console.warn(`Reconnecting to ${hub}`);
    },
  })
  .mount("#app");
```

`baseUrl`, `enabled`, and `connectionKey` accept a value, ref, computed ref, or getter.

Changes to these identity values rebuild the connections. `accessTokenFactory` reads the current token during each negotiation without a rebuild.

### 3. Use the composables — everything below is fully typed

```vue
<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import {
  useHubConsumer,
  useHubStatus,
  useOnReconnected,
  useSignalR,
  useSignalREvent,
  useSignalRInvoke,
  useSignalRSend,
  useSignalRTeardown,
} from "./signalr";

const roomId = "general";

// One readonly ref per hub
const status = useHubStatus("/hubs/chat");

// Event arguments come from the contract
useSignalREvent("/hubs/chat", "ReceiveMessage", (user, message) => {
  console.log(user, message);
});

// Invoke waits for the connection and returns the typed server result
const sendMessage = useSignalRInvoke("/hubs/chat", "SendMessage");
await sendMessage(roomId, "hello");

// Send drops the call when the hub is not connected
const send = useSignalRSend("/hubs/chat", "SendMessage");
await send(roomId, "typing");

// Teardown survives component disposal and waits for a connecting hub
const leaveRoom = useSignalRTeardown("/hubs/chat", "LeaveRoomAsync");
onUnmounted(() => void leaveRoom(roomId));

// Re-sync data after a reconnect
useOnReconnected("/hubs/chat", () => refetchMessages());

// Keep a lazy hub connected without subscribing to status or events
useHubConsumer("/hubs/chat");

// Last resort: access the raw HubConnection
const { getConnection } = useSignalR();
onMounted(() => getConnection("/hubs/chat")?.send("SendMessage", roomId, "ready"));
</script>

<template>
  <p>Status: {{ status }}</p>
</template>
```

### Reliable join/leave (session pattern)

A common pattern joins a session on mount and leaves it on unmount.

```vue
<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { useSignalRInvoke, useSignalRTeardown } from "./signalr";

const roomId = "general";
const joinRoom = useSignalRInvoke("/hubs/chat", "JoinRoomAsync");
const leaveRoom = useSignalRTeardown("/hubs/chat", "LeaveRoomAsync");

onMounted(() => void joinRoom(roomId));
onUnmounted(() => void leaveRoom(roomId));
</script>
```

A plain `useSignalRInvoke` or `useSignalRSend` makes the **leave** unreliable:

- `useSignalRInvoke` aborts active calls on disposal. A leave from `onUnmounted` can stop before it reaches the server.
- `useSignalRSend` drops calls when the hub is not `Connected`. A leave can race a connecting socket.

`useSignalRTeardown` fixes both cases. It:

- **survives the calling scope disposal** because it runs detached,
- **queues while connecting** for up to `timeout` (default 10s),
- **holds a lazy hub open** until the send operation is complete.

It resolves `true` after dispatch. It resolves `false` after a connection timeout and never throws.

> If an invoke only needs to survive disposal, pass `{ keepAliveOnUnmount: true }`. Use teardown for the connecting race.

## Vue-specific behavior

- **The configured client is the plugin.** Pass it to `app.use(signalR, options)` before the application mounts.
- **`useHubStatus` returns a readonly `Ref<HubConnectionStatus>`.** Vue templates unwrap it. Scripts read its current value through `.value`.
- **Status refs are granular.** A status change for hub B does not update a consumer of hub A.
- **Composables use the active effect scope.** Components and manual effect scopes release listeners and lazy references during disposal.
- **Hub, event, and method arguments are read once.** Call a composable again when an application needs a different static target.
- **Handlers are normal Vue closures.** Read refs inside handlers to get their current values.
- **The plugin supports reactive identity options.** Only `baseUrl`, `enabled`, and `connectionKey` cause connection rebuilds.

## Nuxt and SSR

Package imports do not access browser globals or start connections. Server plugin installation provides an inert context for composables during rendering.

Use one universal Nuxt plugin. Do not add the `.client` suffix because server-rendered composables also need the provided context.

```ts
// plugins/signalr.ts
import { signalR } from "~/signalr";

export default defineNuxtPlugin((nuxtApp) => {
  const token = useCookie("token");

  nuxtApp.vueApp.use(signalR, {
    baseUrl: useRuntimeConfig().public.apiUrl,
    enabled: () => import.meta.client && Boolean(token.value),
    accessTokenFactory: () => token.value ?? "",
  });
});
```

The browser installation starts connections. The server installation always reports each hub as `"disconnected"`.

## Differences from other Vue SignalR wrappers

[`@dreamonkey/vue-signalr`](https://www.npmjs.com/package/@dreamonkey/vue-signalr) also uses a Vue plugin and composable.

That package requires users to build and supply one `HubConnection`. It types commands and events through module augmentation.

This adapter infers its contract from `config.hubs`. The shared core also manages these behaviors:

- multiple hubs and shared connections,
- one status ref per hub,
- lazy reference counting and grace periods,
- initial retry and automatic reconnect,
- invoke retry, send, and teardown semantics,
- token rotation without connection recreation.

## API

| Export | Description |
| --- | --- |
| `createSignalRClient(config)` | Returns the configured plugin and composables, typed against the inferred contract. |
| `app.use(signalR, options)` | Builds, starts, retries, and reconnects configured hubs for one Vue application. |
| `useSignalR()` | Returns the raw context, including connection access and point status reads. |
| `useHubStatus(hub)` | Returns a readonly status ref for one hub. It also keeps the hub alive. |
| `useSignalREvent(hub, event, handler)` | Subscribes to a typed server event for the active effect scope. |
| `useSignalRInvoke(hub, method, options?)` | Waits for the connection and returns the typed method result. Retry is optional. |
| `useSignalRSend(hub, method)` | Sends without waiting. It returns `false` when the hub is not connected. |
| `useSignalRTeardown(hub, method, options?)` | Survives disposal, waits while connecting, and holds a lazy hub until dispatch. |
| `useOnReconnected(hub, callback)` | Runs a callback after each reconnect, but not after the first connection. |
| `useHubConsumer(hub)` | Keeps a lazy hub connected for the active effect scope without another subscription. |
| `event<Args>()` | Declares the handler argument tuple for a server event. |
| `method<Args, Return>()` | Declares the argument tuple and return type for a server method. |
| `InvokeError` | Wraps the last invoke failure after configured retries are exhausted. |

### Plugin options

Required: `baseUrl`, `accessTokenFactory`.

Optional: `enabled` (default `true`), `connectionKey`, `onStatusChange`, `onError`.

Connection behavior belongs in the configuration passed to `createSignalRClient`.

## More

The [root README](https://github.com/DammersCode/use-signalr#readme) documents per-hub configuration and call semantics.

[CONTRIBUTING.md](https://github.com/DammersCode/use-signalr/blob/main/CONTRIBUTING.md) documents the development workflow.

## License

MIT © [DammersCode](https://github.com/DammersCode)
