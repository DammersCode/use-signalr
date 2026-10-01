# @dammers/use-signalr-solid

Provider and hooks for typed [SignalR](https://learn.microsoft.com/aspnet/core/signalr) in Solid. Part of [use-signalr](https://use-signalr.vercel.app).

[![npm](https://img.shields.io/npm/v/@dammers/use-signalr-solid.svg)](https://www.npmjs.com/package/@dammers/use-signalr-solid)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/DammersCode/use-signalr/blob/main/LICENSE)

## Install

```bash
npm install @dammers/use-signalr-solid @microsoft/signalr
```

It needs `solid-js` ^1.7, `@microsoft/signalr` ^8 || ^9 || ^10, and Node 20.19 or later.

## Example

This file declares a hub, connects it, and reads a typed method result:

<!-- hero:solid:start -->
```tsx
import { createSignal } from "solid-js";
import { createSignalRClient, method } from "@dammers/use-signalr-solid";

const { SignalRProvider, useSignalRInvoke } = createSignalRClient({
  hubs: {
    "/hubs/rooms": {
      methods: { GetHistory: method<[roomId: string], { text: string }[]>() },
    },
  },
});

function HistoryCount(props: { roomId: string }) {
  const getHistory = useSignalRInvoke("/hubs/rooms", "GetHistory");
  const [count, setCount] = createSignal(0);
  const load = () => getHistory(props.roomId).then((m) => setCount(m.length)).catch(console.error);
  return <button onClick={load}>{count()} messages</button>;
}

export function App() {
  return (
    <SignalRProvider baseUrl="https://api.example.com" accessTokenFactory={() => "token"}>
      <HistoryCount roomId="general" />
    </SignalRProvider>
  );
}
```
<!-- hero:solid:end -->

## Documentation

- [Quick start](https://use-signalr.vercel.app/docs/solid/quick-start)
- [Provider setup](https://use-signalr.vercel.app/docs/solid/concepts/provider)
- [Events](https://use-signalr.vercel.app/docs/solid/concepts/events) and [calls](https://use-signalr.vercel.app/docs/solid/concepts/calls)
- [Connection status](https://use-signalr.vercel.app/docs/solid/concepts/connection-status) and [recovery](https://use-signalr.vercel.app/docs/solid/concepts/recovery)
- [API reference](https://use-signalr.vercel.app/docs/solid/reference/api)
- [Troubleshooting](https://use-signalr.vercel.app/docs/solid/reference/troubleshooting)

## License

[MIT](https://github.com/DammersCode/use-signalr/blob/main/LICENSE) © [DammersCode](https://github.com/DammersCode)
