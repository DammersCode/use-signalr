# @dammers/use-signalr-vue

Typed SignalR plugin and composables for Vue 3. It supports multiple hubs, lazy hubs, retry, reconnect, live hub status, fire-and-forget sends, and reliable teardown sends.

## Install

```bash
npm i @dammers/use-signalr-vue @microsoft/signalr
```

Vue 3.3 and `@microsoft/signalr` 8 or later are required.

## Setup

Create one configured client. The hub keys, event arguments, method arguments, and method returns are inferred.

```ts
// signalr.ts
import { createSignalRClient, event, method } from "@dammers/use-signalr-vue";

export const signalR = createSignalRClient({
  hubs: {
    "/hubs/chat": {
      events: { ReceiveMessage: event<[user: string, text: string]>() },
      methods: {
        JoinRoom: method<[roomId: string], { ok: boolean }>(),
        LeaveRoom: method<[roomId: string]>(),
      },
      // lazy: true,
    },
  },
});
```

Install it once on the app. `baseUrl`, `enabled`, and `connectionKey` can be values, refs, computed refs, or getters. They are watched as connection identity. Token and callback functions are read at connection or callback time, so token rotation does not rebuild a connection.

```ts
import { createApp, computed, ref } from "vue";
import App from "./App.vue";
import { signalR } from "./signalr";

const token = ref("");
const enabled = computed(() => token.value.length > 0);

createApp(App).use(signalR, {
  baseUrl: import.meta.env.VITE_API_URL,
  enabled,
  accessTokenFactory: () => token.value,
  onError: (hub, error) => console.error(hub, error),
}).mount("#app");
```

## Composables

Import composables from your configured client. Call them during `setup()`.

```ts
import { onMounted, onUnmounted } from "vue";
import { signalR } from "./signalr";

const status = signalR.useHubStatus("/hubs/chat");
signalR.useSignalREvent("/hubs/chat", "ReceiveMessage", (user, text) => {
  console.log(user, text);
});
const join = signalR.useSignalRInvoke("/hubs/chat", "JoinRoom", { retries: 2 });
const leave = signalR.useSignalRTeardown("/hubs/chat", "LeaveRoom");
const send = signalR.useSignalRSend("/hubs/chat", "LeaveRoom");

onMounted(() => void join("room-1"));
onUnmounted(() => void leave("room-1"));
```

`useSignalR` returns the raw context. `useHubConsumer` holds a lazy hub while the component exists. `useHubStatus` returns a readonly ref for only that hub. `useSignalREvent` subscribes to a typed event and reattaches after reconnect. `useOnReconnected` runs a callback after reconnect.

`useSignalRInvoke` waits for a connection and returns the typed server result. It aborts its retry work when the component unmounts unless `keepAliveOnUnmount` is true. Retry can invoke a method more than once, so use it only for idempotent methods.

`useSignalRSend` does not wait. It returns `false` if the hub is not connected and `true` after dispatch. Use it for lossy signals.

`useSignalRTeardown` is best effort for cleanup. It survives unmount and holds a lazy hub until the send operation is complete.

The teardown function returns `true` after dispatch. It returns `false` if the connection timeout expires.

## Nuxt and SSR

The plugin is safe to install during SSR. It provides an inert context and never builds a SignalR connection on the server. Browser watching and connections start only on the client.

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

Keep the plugin universal. The server installation provides the context that composables use during server rendering.

## Comparison with `@dreamonkey/vue-signalr`

[`@dreamonkey/vue-signalr`](https://www.npmjs.com/package/@dreamonkey/vue-signalr) requires users to build and supply one `HubConnection`.

That wrapper types commands and events through module augmentation. This package infers them from the configured hub contract.

This package also manages multiple hubs, per-hub status refs, lazy references, invoke retry, send, and teardown behavior.

Both packages use a Vue plugin and composables. This package does not add global properties or a provider component.

## API

The package exports `createSignalRClient`, `event`, and `method`.

The configured client exposes `install` and all documented `use*` composables.
