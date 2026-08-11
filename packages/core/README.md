# @dammers/use-signalr-core

Framework-free connection lifecycle, contracts, and retry logic for [SignalR](https://learn.microsoft.com/aspnet/core/signalr): the shared engine behind `@dammers/use-signalr-react` and `@dammers/use-signalr-solid`.

[![npm](https://img.shields.io/npm/v/@dammers/use-signalr-core.svg)](https://www.npmjs.com/package/@dammers/use-signalr-core)
![types](https://img.shields.io/badge/types-included-blue.svg)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

## Who needs this

Adapter authors — if you are building bindings for a framework this repo does not already cover. This package has no provider, no hooks, no reactive layer: it owns connection lifecycle, contract types, and retry/backoff math, and leaves rendering to the adapter.

Building an app? Install `@dammers/use-signalr-react` or `@dammers/use-signalr-solid` instead — this package is a dependency of both, not something you install directly.

## Install

```bash
npm i @dammers/use-signalr-core @microsoft/signalr
```

Requires `@microsoft/signalr` ≥ 8.

## What it exposes

| Export                                                                                                           | What it does                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createConnectionManager(deps)`                                                                                  | Owns one provider generation's `HubConnection`s: build, start with retry, lazy ref-counted start/stop, reconnect fan-out. No framework dependency — driven by callbacks. |
| `createInvoker(deps, hub, method, getOptions, setAbort, clearAbort?)`                                            | Builds the request/response call function behind an invoke hook: waits for connection, retries idempotent failures, rethrows business errors.                            |
| `createAbortScope()`                                                                                             | Tracks one consumer's in-flight invocations. Pass `track`/`untrack` to `createInvoker`, call `abortAll` from the adapter's cleanup to cancel every pending call.         |
| `createSender(getConnection, hub, method)`                                                                       | Builds the fire-and-forget call function behind a send hook: drops if not connected.                                                                                     |
| `createTeardownSender(deps, hub, method, getOptions)`                                                            | Builds the reliable teardown call function: survives disposal, queues while connecting, holds a lazy hub open until flushed.                                             |
| `event<Args>()` / `method<Args, Return?>()`                                                                      | Contract markers used inside `hubs.<path>.events` / `.methods` to declare what a hub pushes and what it accepts.                                                         |
| `hubKeys(config)`, `resolveHubConfig(config, hubConfig)`                                                         | Resolve per-hub config against global defaults.                                                                                                                          |
| `isRetriableConnectError`, `isRetriableInvokeError`, `resolveBackoff`, `DEFAULT_BACKOFF`, `sleep`, `InvokeError` | Retry/backoff building blocks and the error type thrown once an invoke's attempts are exhausted.                                                                         |

Plus the contract and config types: `HubString`, `HubContract`, `SignalRContract`, `EventDef`, `MethodDef`, `HubDef`, `InferContract`, `EventName`, `MethodName`, `EventArgs`, `MethodArgs`, `MethodReturn`, `HubConnectionStatus`, `ReconnectConfig`, `PerHubConfig`, `SignalRClientConfig`, `ResolvedHubConfig`, `InvokeOptions`, `TeardownOptions`, `StatusStore`, `SignalRProviderPropsBase`, `SignalRContextValueBase`, `ConnectionManager`, `ConnectionManagerDeps`, `HubEntry`, `CallTarget`, `AbortScope`.

An adapter wraps `createConnectionManager` in its own reactive provider (context + hooks + a status store built on its framework's primitives), and wraps the three call factories in hooks that supply the framework's own acquire/release and abort/cleanup lifecycle. See `packages/react` and `packages/solid` in this repo for two full implementations.

## More

Shared concepts (the contract, per-hub config, invoke retry, send vs invoke vs teardown) live in the [root README](https://github.com/DammersCode/use-signalr#readme).

## License

MIT © [DammersCode](https://github.com/DammersCode)
