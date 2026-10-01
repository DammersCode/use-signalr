# @dammers/use-signalr-preact

Provider and hooks for typed [SignalR](https://learn.microsoft.com/aspnet/core/signalr) in Preact. Part of [use-signalr](https://use-signalr.vercel.app).

[![npm](https://img.shields.io/npm/v/@dammers/use-signalr-preact.svg)](https://www.npmjs.com/package/@dammers/use-signalr-preact)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/DammersCode/use-signalr/blob/main/LICENSE)

## Install

```bash
npm install @dammers/use-signalr-preact @microsoft/signalr
```

It needs Preact ^10.20 or ^11, `@microsoft/signalr` ^8 || ^9 || ^10, and Node 20.19 or later.

## Example

This file declares a hub, connects it, and reads a typed method result:

<!-- hero:preact:start -->
```tsx
import { useState } from "preact/hooks";
import { createSignalRClient, method } from "@dammers/use-signalr-preact";

const { SignalRProvider, useSignalRInvoke } = createSignalRClient({
  hubs: {
    "/hubs/rooms": {
      methods: { GetHistory: method<[roomId: string], { text: string }[]>() },
    },
  },
});

function HistoryCount({ roomId }: { roomId: string }) {
  const getHistory = useSignalRInvoke("/hubs/rooms", "GetHistory");
  const [count, setCount] = useState(0);
  const load = () => getHistory(roomId).then((m) => setCount(m.length)).catch(console.error);
  return <button onClick={load}>{count} messages</button>;
}

export function App() {
  return (
    <SignalRProvider baseUrl="https://api.example.com" accessTokenFactory={() => "token"}>
      <HistoryCount roomId="general" />
    </SignalRProvider>
  );
}
```
<!-- hero:preact:end -->

## Documentation

- [Quick start](https://use-signalr.vercel.app/docs/preact/quick-start)
- [Provider setup](https://use-signalr.vercel.app/docs/preact/concepts/provider)
- [Events](https://use-signalr.vercel.app/docs/preact/concepts/events) and [calls](https://use-signalr.vercel.app/docs/preact/concepts/calls)
- [Connection status](https://use-signalr.vercel.app/docs/preact/concepts/connection-status) and [recovery](https://use-signalr.vercel.app/docs/preact/concepts/recovery)
- [API reference](https://use-signalr.vercel.app/docs/preact/reference/api)
- [Troubleshooting](https://use-signalr.vercel.app/docs/preact/reference/troubleshooting)

## License

[MIT](https://github.com/DammersCode/use-signalr/blob/main/LICENSE) © [DammersCode](https://github.com/DammersCode)
