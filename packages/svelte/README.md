# @dammers/use-signalr-svelte

Context and stores for typed [SignalR](https://learn.microsoft.com/aspnet/core/signalr) in Svelte. Part of [use-signalr](https://use-signalr.vercel.app).

[![npm](https://img.shields.io/npm/v/@dammers/use-signalr-svelte.svg)](https://www.npmjs.com/package/@dammers/use-signalr-svelte)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/DammersCode/use-signalr/blob/main/LICENSE)

## Install

```bash
npm install @dammers/use-signalr-svelte @microsoft/signalr
```

It needs Svelte ^5.15, `@microsoft/signalr` ^8 || ^9 || ^10, and Node 20.19 or later.

## Example

This file declares a hub, connects it, and reads a typed method result:

<!-- hero:svelte:start -->
```svelte
<script module lang="ts">
  import { createSignalRClient, method } from "@dammers/use-signalr-svelte";

  export const { provideSignalR, hubInvoke } = createSignalRClient({
    hubs: {
      "/hubs/rooms": {
        methods: { GetHistory: method<[roomId: string], { text: string }[]>() },
      },
    },
  });
</script>

<script lang="ts">
  provideSignalR({ baseUrl: "https://api.example.com", accessTokenFactory: () => "token" });

  const getHistory = hubInvoke("/hubs/rooms", "GetHistory");
  let count = $state(0);
  const load = () => getHistory("general").then((m) => (count = m.length)).catch(console.error);
</script>

<button onclick={load}>{count} messages</button>
```
<!-- hero:svelte:end -->

## Documentation

- [Quick start](https://use-signalr.vercel.app/docs/svelte/quick-start)
- [Provider setup](https://use-signalr.vercel.app/docs/svelte/concepts/provider)
- [Events](https://use-signalr.vercel.app/docs/svelte/concepts/events) and [calls](https://use-signalr.vercel.app/docs/svelte/concepts/calls)
- [Connection status](https://use-signalr.vercel.app/docs/svelte/concepts/connection-status) and [recovery](https://use-signalr.vercel.app/docs/svelte/concepts/recovery)
- [API reference](https://use-signalr.vercel.app/docs/svelte/reference/api)
- [Troubleshooting](https://use-signalr.vercel.app/docs/svelte/reference/troubleshooting)

## License

[MIT](https://github.com/DammersCode/use-signalr/blob/main/LICENSE) © [DammersCode](https://github.com/DammersCode)
