# @dammers/use-signalr-core

Framework-free connection lifecycle, contracts, and retry logic for [SignalR](https://learn.microsoft.com/aspnet/core/signalr). Core owns all connection behavior. Every adapter in this repository is a thin reactive layer on top of it.

[![npm](https://img.shields.io/npm/v/@dammers/use-signalr-core.svg)](https://www.npmjs.com/package/@dammers/use-signalr-core)
![types](https://img.shields.io/badge/types-included-blue.svg)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

## Who needs this

Adapter authors. This package has no provider, no hooks, and no reactive layer.

If you build an application, install an adapter instead of core. Core is a dependency of every adapter:

- [`@dammers/use-signalr-react`](https://github.com/DammersCode/use-signalr/blob/main/packages/react/README.md)
- [`@dammers/use-signalr-solid`](https://github.com/DammersCode/use-signalr/blob/main/packages/solid/README.md)
- [`@dammers/use-signalr-svelte`](https://github.com/DammersCode/use-signalr/blob/main/packages/svelte/README.md)
- [`@dammers/use-signalr-angular`](https://github.com/DammersCode/use-signalr/blob/main/packages/angular/README.md)
- [`@dammers/use-signalr-vue`](https://github.com/DammersCode/use-signalr/blob/main/packages/vue/README.md)
- [`@dammers/use-signalr-preact`](https://github.com/DammersCode/use-signalr/blob/main/packages/preact/README.md)
- [`@dammers/use-signalr-lit`](https://github.com/DammersCode/use-signalr/blob/main/packages/lit/README.md)

## Install

```bash
npm i @dammers/use-signalr-core @microsoft/signalr
```

Core requires `@microsoft/signalr` ≥ 8.

## The adapter entry point

`createSignalRSession(deps)` is the one call an adapter builds its provider around. It owns the connection generation, lazy ref counts, grace periods, reconnect fan-out, and the context value.

```ts
import { createSignalRSession } from "@dammers/use-signalr-core";

const session = createSignalRSession({
  hubs, // the hub paths from the config
  resolve, // (hub) => ResolvedHubConfig
  statusStore, // the adapter's own reactive StatusStore
  getAccessToken, // read at call time, so token rotation causes no rebuild
  onStatusChange, // optional
  onError, // optional
});
```

The session returns three members:

| Member | What it does |
| --- | --- |
| `start(baseUrl)` | Builds the live connection generation and disposes the previous one. |
| `stop()` | Disposes the live generation and marks every hub disconnected. Idempotent. |
| `context` | The value the adapter puts into its framework context. Stable identity. |

Call `start` only from a client-only lifecycle hook. `createSignalRSession` does no I/O when you construct it.

## Call helpers

An adapter maps its invoke, send, and teardown surface onto these three factories. Do not reimplement their semantics.

| Helper | What it does |
| --- | --- |
| `createInvoker(target, hub, method, getOptions, setAbort, clearAbort?)` | Request/response call: waits for a connection, retries retriable failures, rethrows business errors. |
| `createSender(getConnection, hub, method)` | Fire-and-forget call. Drops the call when the hub is not connected. |
| `createTeardownSender(deps, hub, method, getOptions)` | Reliable cleanup call: survives disposal, queues while connecting, and holds a lazy hub open until it flushes. |

`createAbortScope()` tracks every in-flight invoke `AbortController` for one consumer. Pass its `track` and `untrack` as `setAbort` and `clearAbort`. Call `abortAll` from the adapter's cleanup to abort all in-flight calls at once.

## Also exported

`event<Args>()` and `method<Args, Return?>()` declare a hub contract. `hubKeys(config)` and `resolveHubConfig(config, hubConfig)` resolve per-hub configuration against the global defaults. `isRetriableConnectError`, `isRetriableInvokeError`, `resolveBackoff`, `DEFAULT_BACKOFF`, `sleep`, and `InvokeError` are the retry building blocks.

The contract and configuration types ship with the package: `HubString`, `HubContract`, `SignalRContract`, `EventDef`, `MethodDef`, `HubDef`, `InferContract`, `EventName`, `MethodName`, `EventArgs`, `MethodArgs`, `MethodReturn`, `HubConnectionStatus`, `ReconnectConfig`, `PerHubConfig`, `SignalRClientConfig`, `ResolvedHubConfig`, `InvokeOptions`, `TeardownOptions`, `StatusStore`, `SignalRSession`, `SignalRSessionDeps`, `SignalRProviderPropsBase`, `SignalRContextValueBase`, `ConnectionManager`, `ConnectionManagerDeps`, `HubEntry`, `CallTarget`, `AbortScope`.

## More

[ARCHITECTURE.md](https://github.com/DammersCode/use-signalr/blob/main/ARCHITECTURE.md) has the full new-adapter checklist, the core/adapter split, and the naming conventions.

Shared concepts (the contract, per-hub configuration, invoke retry, send versus invoke versus teardown) live in the [root README](https://github.com/DammersCode/use-signalr#readme).

## License

MIT © [DammersCode](https://github.com/DammersCode)
