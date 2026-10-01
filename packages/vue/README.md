# @dammers/use-signalr-vue

Plugin and composables for typed [SignalR](https://learn.microsoft.com/aspnet/core/signalr) in Vue. Part of [use-signalr](https://use-signalr.vercel.app).

[![npm](https://img.shields.io/npm/v/@dammers/use-signalr-vue.svg)](https://www.npmjs.com/package/@dammers/use-signalr-vue)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/DammersCode/use-signalr/blob/main/LICENSE)

## Install

```bash
npm install @dammers/use-signalr-vue @microsoft/signalr
```

It needs Vue ^3.3, `@microsoft/signalr` ^8 || ^9 || ^10, and Node 20.19 or later.

## Example

This file declares a hub, connects it, and reads a typed method result:

<!-- hero:vue:start -->
```ts
import { createApp, ref } from "vue";
import { createSignalRClient, method } from "@dammers/use-signalr-vue";
import App from "./App.vue";

export const signalR = createSignalRClient({
  hubs: {
    "/hubs/rooms": {
      methods: { GetHistory: method<[roomId: string], { text: string }[]>() },
    },
  },
});

createApp(App)
  .use(signalR, { baseUrl: "https://api.example.com", accessTokenFactory: () => "token" })
  .mount("#app");

// Call this composable in a component's setup().
export function useHistoryCount(roomId: string) {
  const getHistory = signalR.useSignalRInvoke("/hubs/rooms", "GetHistory");
  const count = ref(0);
  const load = () => getHistory(roomId).then((m) => (count.value = m.length)).catch(console.error);
  return { count, load };
}
```
<!-- hero:vue:end -->

## Documentation

- [Quick start](https://use-signalr.vercel.app/docs/vue/quick-start)
- [Provider setup](https://use-signalr.vercel.app/docs/vue/concepts/provider)
- [Events](https://use-signalr.vercel.app/docs/vue/concepts/events) and [calls](https://use-signalr.vercel.app/docs/vue/concepts/calls)
- [Connection status](https://use-signalr.vercel.app/docs/vue/concepts/connection-status) and [recovery](https://use-signalr.vercel.app/docs/vue/concepts/recovery)
- [API reference](https://use-signalr.vercel.app/docs/vue/reference/api)
- [Troubleshooting](https://use-signalr.vercel.app/docs/vue/reference/troubleshooting)

## License

[MIT](https://github.com/DammersCode/use-signalr/blob/main/LICENSE) © [DammersCode](https://github.com/DammersCode)
