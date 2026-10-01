<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/DammersCode/use-signalr/main/apps/docs/public/brand/lockup-horizontal-on-dark.svg">
    <img alt="use-signalr" src="https://raw.githubusercontent.com/DammersCode/use-signalr/main/apps/docs/public/brand/lockup-horizontal-on-light.svg" height="56">
  </picture>
</p>

<p align="center">Typed <a href="https://learn.microsoft.com/aspnet/core/signalr">SignalR</a> hooks for React, Vue, Angular, Svelte, Preact, Solid, and Lit, on one shared core.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@dammers/use-signalr-core"><img alt="npm" src="https://img.shields.io/npm/v/@dammers/use-signalr-core.svg"></a>
  <a href="https://github.com/DammersCode/use-signalr/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/DammersCode/use-signalr/actions/workflows/ci.yml/badge.svg"></a>
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-green.svg"></a>
  <a href="https://github.com/DammersCode/use-signalr/stargazers"><img alt="stars" src="https://img.shields.io/github/stars/DammersCode/use-signalr.svg?style=social"></a>
</p>

<p align="center"><a href="https://use-signalr.vercel.app"><b>Documentation</b></a></p>

---

Declare your hubs once. Every event handler, call, and return value is typed from that declaration, and each framework gets helpers that bind the connection to its own lifecycle.

## Features

- **Typed from one contract.** Declare events and methods with `event()` and `method()`. No hand-written types.
- **Many hubs, one provider.** Each hub connects once, however many components use it.
- **Lazy hubs.** A lazy hub connects when the first consumer needs it and stops after the last one leaves.
- **Recovers by itself.** A lost connection comes back without app code. Reconnect callbacks let you refetch.
- **Teardown that lands.** A leave call in a cleanup waits for the connection and is sent once.
- **SSR-safe, zero runtime dependencies.** Nothing connects on the server. The framework and `@microsoft/signalr` are peers.

## Packages

| Package | Framework | Docs |
| --- | --- | --- |
| [`@dammers/use-signalr-react`](https://www.npmjs.com/package/@dammers/use-signalr-react) | React ^19 | [Quick start](https://use-signalr.vercel.app/docs/react/quick-start) |
| [`@dammers/use-signalr-vue`](https://www.npmjs.com/package/@dammers/use-signalr-vue) | Vue ^3.3 | [Quick start](https://use-signalr.vercel.app/docs/vue/quick-start) |
| [`@dammers/use-signalr-angular`](https://www.npmjs.com/package/@dammers/use-signalr-angular) | Angular ^20 \|\| ^21 \|\| ^22 | [Quick start](https://use-signalr.vercel.app/docs/angular/quick-start) |
| [`@dammers/use-signalr-svelte`](https://www.npmjs.com/package/@dammers/use-signalr-svelte) | Svelte ^5.15 | [Quick start](https://use-signalr.vercel.app/docs/svelte/quick-start) |
| [`@dammers/use-signalr-preact`](https://www.npmjs.com/package/@dammers/use-signalr-preact) | Preact ^10.20 \|\| ^11 | [Quick start](https://use-signalr.vercel.app/docs/preact/quick-start) |
| [`@dammers/use-signalr-solid`](https://www.npmjs.com/package/@dammers/use-signalr-solid) | Solid ^1.7 | [Quick start](https://use-signalr.vercel.app/docs/solid/quick-start) |
| [`@dammers/use-signalr-lit`](https://www.npmjs.com/package/@dammers/use-signalr-lit) | Lit ^3 | [Quick start](https://use-signalr.vercel.app/docs/lit/quick-start) |
| [`@dammers/use-signalr-core`](https://www.npmjs.com/package/@dammers/use-signalr-core) | none | [Build an adapter](https://use-signalr.vercel.app/docs/core/build-an-adapter) |

Every adapter has the same capabilities. All packages need `@microsoft/signalr` ^8 || ^9 || ^10 and Node 20.19 or later.

## Example

This React file declares a hub, connects it, and reads a typed method result. The quick start of each framework shows the same example:

<!-- hero:react:start -->
```tsx
import { useState } from "react";
import { createSignalRClient, method } from "@dammers/use-signalr-react";

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
<!-- hero:react:end -->

## Contributing

Setup, scripts, and workflow are in [CONTRIBUTING.md](./CONTRIBUTING.md). Runnable example apps for every framework are in [`examples/`](./examples).

## License

[MIT](./LICENSE) © [DammersCode](https://github.com/DammersCode)
