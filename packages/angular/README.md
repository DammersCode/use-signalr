# @dammers/use-signalr-angular

A typed, reusable [SignalR](https://learn.microsoft.com/aspnet/core/signalr) provider and signal set for Angular, driven by your contract.

[![npm](https://img.shields.io/npm/v/@dammers/use-signalr-angular.svg)](https://www.npmjs.com/package/@dammers/use-signalr-angular)
![types](https://img.shields.io/badge/types-included-blue.svg)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

```ts
const { provideSignalR, injectHubInvoke } = createSignalRClient({
  hubs: {
    "/hubs/chat": {
      methods: { SendMessage: method<[roomId: string, message: string]>() },
    },
  },
});
```

One factory call returns a provider function and a set of signals/functions, each typed against your hub contract. Event args, method args, and return values are all inferred from the config.

Shared concepts (the contract, per-hub config, invoke retry, send vs invoke vs teardown) are covered in the [root README](https://github.com/DammersCode/use-signalr#readme). This document covers Angular-specific install and usage.

## Install

```bash
npm i @dammers/use-signalr-angular @microsoft/signalr
```

Requires `@angular/core` ≥ 20 and `@microsoft/signalr` ≥ 8.

## Usage

### 1. Define your contract and create the client

The **keys of `config.hubs` declare the hubs**. Each hub's `events` (what the server pushes to you) and `methods` (what you invoke) are declared inline with the `event()` and `method()` markers. This is the same contract shape as the other packages — only the provider and the functions below differ.

```ts
// signalr.ts
import { createSignalRClient, event, method } from "@dammers/use-signalr-angular";

export const {
  provideSignalR,
  injectSignalR,
  injectHubEvent,
  injectHubInvoke,
  injectHubSend,
  injectHubTeardown,
  injectHubStatus,
  injectOnReconnected,
  injectKeepHubAlive,
} = createSignalRClient({
  hubs: {
    "/hubs/chat": {
      events: {
        ReceiveMessage: event<[user: string, message: string]>(),
      },
      methods: {
        SendMessage: method<[roomId: string, message: string]>(),
        JoinRoom: method<[roomId: string], { success: boolean }>(),
      },
      // per-hub config also goes here (see the root README)
    },
  },
  // global defaults (all optional):
  // lazy: false, reconnect: true, maxConnectRetries: 2, logLevel: LogLevel.Information
});
```

`event<Args>()` takes the handler's argument tuple. `method<Args, Return>()` takes the argument tuple and the resolved return type (default `void`).

### 2. Register the provider in `app.config.ts`

`provideSignalR` returns `EnvironmentProviders` — add it to `ApplicationConfig.providers`, alongside `bootstrapApplication`.

```ts
// app.config.ts
import { ApplicationConfig } from "@angular/core";
import { provideSignalR } from "./signalr";
import { authTokenFactory, isLoggedIn } from "./auth";

export const appConfig: ApplicationConfig = {
  providers: [
    provideSignalR({
      baseUrl: "https://api.example.com",
      accessTokenFactory: authTokenFactory,
      enabled: isLoggedIn, // optional, default true; a value, getter, or Signal
      onError: (hub, err) => console.error(`Connection to ${hub} failed`, err),
      onStatusChange: (hub, status) => {
        if (status === "reconnecting") console.warn(`Reconnecting to ${hub}…`);
      },
    }),
  ],
};
```

```ts
// main.ts
import { bootstrapApplication } from "@angular/platform-browser";
import { appConfig } from "./app/app.config";
import { AppComponent } from "./app/app.component";

bootstrapApplication(AppComponent, appConfig);
```

`baseUrl`, `enabled`, and `connectionKey` each accept a plain value, a zero-arg getter, or a `Signal`; passing a getter/`Signal` makes the provider react to it — the connection rebuilds whenever the value changes. `accessTokenFactory` is the token factory itself, or a `Signal` holding one. It is called on every negotiate, so **token rotation never rebuilds the connection**:

```ts
provideSignalR({
  baseUrl: "https://api.example.com",
  accessTokenFactory: () => this.auth.token(),
  enabled: () => this.auth.isLoggedIn(),
});
```

### 3. Consume the exported functions in a standalone component — everything below is fully typed

```ts
// chat.component.ts
import { Component, OnDestroy, signal } from "@angular/core";
import {
  injectHubEvent,
  injectHubInvoke,
  injectHubSend,
  injectHubTeardown,
  injectHubStatus,
  injectOnReconnected,
  injectSignalR,
} from "./signalr";

@Component({
  standalone: true,
  selector: "app-chat",
  template: `<p>Status: {{ status() }}</p>`,
})
export class ChatComponent {
  // Live connection status, as a granular Signal — read as status() in the template
  status = injectHubStatus("/hubs/chat");

  // Invoke a server method — args + return inferred, waits for connection
  private sendMessage = injectHubInvoke("/hubs/chat", "SendMessage");

  // Typed fire-and-forget — does not wait for connection; drops if not connected
  private send = injectHubSend("/hubs/chat", "SendMessage");

  // Reliable teardown — for a method called on destroy. Survives disposal,
  // queues while the hub connects (instead of dropping), and holds a lazy
  // hub open until it flushes. Best-effort: Promise<boolean> (dispatched?).
  private joinRoom = injectHubInvoke("/hubs/chat", "JoinRoomAsync");
  private leaveRoom = injectHubTeardown("/hubs/chat", "LeaveRoomAsync");

  constructor() {
    // Listen to a server event — args inferred from the contract
    injectHubEvent("/hubs/chat", "ReceiveMessage", (user, message) => {
      console.log(user, message);
    });

    // Re-sync after a reconnect, for example to refetch a query
    injectOnReconnected("/hubs/chat", () => this.refetchMessages());

    this.joinRoom(this.roomId);
  }

  async submit(text: string) {
    await this.sendMessage(this.roomId, text); // typed params, Promise<void>
    await this.send(this.roomId, "typing"); // typed args; Promise<boolean> (true = dispatched)
  }

  private refetchMessages() {
    // ...
  }

  private roomId = "general";
}
```

Every `inject*` function must run in an injection context — a component/directive constructor (or a field initializer, as above), or a factory passed an explicit `Injector`. Calling one outside an injection context throws.

### Reliable join/leave (session pattern)

A common pattern joins a session on construction and leaves it on destroy.

```ts
export class RoomComponent implements OnDestroy {
  private joinRoom = injectHubInvoke("/hubs/chat", "JoinRoomAsync");
  private leaveRoom = injectHubTeardown("/hubs/chat", "LeaveRoomAsync");

  constructor() {
    this.joinRoom(this.roomId);
  }

  ngOnDestroy() {
    this.leaveRoom(this.roomId);
  }
}
```

A plain `injectHubInvoke` or `injectHubSend` makes the **leave** unreliable:

- `injectHubInvoke` aborts in-flight calls on `DestroyRef.onDestroy`, so a leave issued in `ngOnDestroy` can be cancelled before it reaches the server.
- `injectHubSend` drops silently if the hub is not `Connected`, so a leave that races a still-connecting socket (a fast route change, a rapid mount/unmount) is lost.

`injectHubTeardown` fixes both problems. It:

- **survives the calling scope's disposal** — it runs detached and is never aborted,
- **queues while connecting** — it waits up to `timeout` (default 10s) for the hub, then sends, instead of dropping,
- **holds a lazy hub open** until the flush completes, even if the disposing scope was its last consumer.

It is best-effort and fire-and-forget: it resolves `true` once dispatched, `false` if the hub never connected in time, and never throws.

> If your leave already uses `injectHubInvoke` and only needs to avoid the abort on destroy, pass `{ keepAliveOnUnmount: true }`. This covers the abort case but **not** the still-connecting race. For that race, use `injectHubTeardown`.

## Lazy hubs

With `lazy: true` on a hub's config, it connects only when the first `inject*` function for that hub is set up, and disconnects `graceMs` after the last one is torn down. Every `inject*` function acquires the hub for its injection scope's lifetime and releases it on `DestroyRef.onDestroy`, so this works automatically. Use `injectKeepHubAlive(hub)` directly when you want a lazy hub connected for a scope that does not otherwise touch it.

## Connection status

`injectHubStatus(hub)` returns a granular `Signal<HubConnectionStatus>` — one signal per hub, backed by `createStatusStore`. Reading it in a `computed()`, an `effect()`, or a template re-runs only when **that** hub's status changes, never when another hub's status changes. Read the current value with `status()`.

## SSR / Angular Universal

All connection work happens client-side only. `provideSignalR`'s factory defers the first `session.start()` call to `afterNextRender`, which never runs on the server. Importing `@dammers/use-signalr-angular` and calling `provideSignalR` during a server render is safe: it registers the provider and builds the context value, but opens zero connections. Every hub reports `"disconnected"` until the client-side render pass runs.

## Cleanup

Every `inject*` function registers `DestroyRef.onDestroy` for its own cleanup — event listeners detach, in-flight invokes abort (unless `keepAliveOnUnmount`), and lazy ref-counts release — so a component or injector that is destroyed cleans up everything it acquired without any manual teardown code.

## Optional RxJS interop

Signals are the primary API. `@dammers/use-signalr-angular/rxjs-interop` is a separate entry point for teams that want an `Observable` view of a hub's status, so `rxjs` stays an optional peer rather than a hard dependency of the main package.

```ts
import { hubStatus$ } from "@dammers/use-signalr-angular/rxjs-interop";
import { injectHubStatus } from "./signalr";

const status = injectHubStatus("/hubs/chat");
const status$ = hubStatus$(status); // Observable<HubConnectionStatus>
```

`hubStatus$(statusSignal, options?)` wraps Angular's `toObservable` around a `Signal<HubConnectionStatus>` from `injectHubStatus`. Call it in an injection context, or pass `{ injector }` to call it elsewhere (for example inside a service constructor run outside one).

## Differences from RxJS/NgRx SignalR libraries

- **Signals-first, not Observable-first.** `injectHubStatus` returns a `Signal`, read directly in templates and `computed()`s. RxJS is available as opt-in interop (above), not the conceptual center of the API.
- **No NgRx dependency or store integration required.** Nothing here assumes or requires an NgRx store; state lives in the signals this package creates. An NgRx integration is possible as a future, separate optional package — it is not part of this one.
- **Typed contract inference, not stringly-typed hub calls.** Hub names, event names, method names, handler args, and return types are all inferred from the `hubs` config passed to `createSignalRClient`, instead of calling `connection.invoke("MethodName", ...)` with unchecked strings.
- **Shared connections and lazy ref-counting are handled by the core**, not left to each consumer. Multiple components injecting the same hub share one connection; a lazy hub connects on first use and disconnects after its last consumer releases it, with a grace period.

## API

| Export | Description |
| --- | --- |
| `createSignalRClient(config)` | Factory. Returns `provideSignalR` and the `inject*` functions below, typed against your contract. |
| `provideSignalR(options)` | Builds, starts, retries, and auto-reconnects every configured hub. Returns `EnvironmentProviders` for `ApplicationConfig.providers`. |
| `injectSignalR()` | Escape hatch to the raw context: `getConnection`, `isHubConnected`, `getStatus`, `waitForConnection`, `acquire`/`release`, `registerReconnect`, `statusStore`. |
| `injectHubStatus(hub)` | Live connection status of a hub, as a granular `Signal<HubConnectionStatus>`. Also keeps the hub alive. |
| `injectHubEvent(hub, event, handler)` | Subscribes to a typed server event for the injection scope's lifetime. Re-attaches across reconnects. |
| `injectHubInvoke(hub, method, options?)` | Typed invoker that waits for the connection and resolves with the method's return value. Opt-in retry. |
| `injectHubSend(hub, method)` | Typed fire-and-forget sender. Drops if not connected; never waits. |
| `injectHubTeardown(hub, method, options?)` | Typed reliable teardown sender: survives disposal, queues while connecting, holds a lazy hub open until flushed. |
| `injectOnReconnected(hub, callback)` | Runs a callback after each reconnect (not the first connect), to refetch stale state. |
| `injectKeepHubAlive(hub)` | Acquires a (possibly lazy) hub for the injection scope's lifetime, without subscribing to events or status. |
| `event<Args>()` | Declares a server event's handler argument tuple in a hub's `events`. |
| `method<Args, Return>()` | Declares an invokable method's argument tuple and return type in a hub's `methods`. |
| `InvokeError` | Thrown by `injectHubInvoke` once retries are exhausted; wraps the last failure. |
| `hubStatus$(statusSignal, options?)` | (`/rxjs-interop` entry point) Wraps a hub status `Signal` as an `Observable<HubConnectionStatus>`. |

## More

Per-hub config, invoke retry semantics, the send/invoke/teardown comparison, and notes on token rotation live in the [root README](https://github.com/DammersCode/use-signalr#readme). Contributing setup lives in [CONTRIBUTING.md](https://github.com/DammersCode/use-signalr/blob/main/CONTRIBUTING.md).

## License

MIT © [DammersCode](https://github.com/DammersCode)
