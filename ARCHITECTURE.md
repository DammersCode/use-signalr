# Architecture

How responsibility splits between `packages/core` and the framework adapters (`packages/react`, `packages/solid`, `packages/svelte`, `packages/angular`, `packages/vue`, `packages/preact`, `packages/lit`), and what a new adapter needs to implement.

## Core responsibilities vs adapter responsibilities

| Core owns | Adapters own |
| --- | --- |
| Connection creation and sharing per hub | Reactive translation (signals/stores/re-renders) |
| Multi-hub coordination | Framework context propagation |
| Per-hub connection state | Lifecycle binding (when to start/stop) |
| Auto-reconnect | The 8 hooks/equivalents as thin wrappers over core |
| Initial-connect retry with backoff | Framework-specific `StatusStore` implementation |
| Lazy connections + ref counting | — |
| Grace periods before lazy teardown | — |
| invoke / send / teardown call helpers | — |
| Token rotation (read at call time) | — |
| Event subscription plumbing (pre-bound handlers) | — |
| Cleanup / disposal | — |
| Typed config resolution (global + per-hub) | — |

Core has no framework dependency anywhere in its code. Adapters never reach into each other — only into `@dammers/use-signalr-core`.

## Adapter lifecycle contract

Every adapter follows the same sequence, built on `packages/core/src/session.ts`:

1. **Create a `StatusStore`** — the adapter's own reactive implementation (`packages/*/src/status-store.ts`), keyed per hub. Angular's is backed by one `signal()` per hub (`packages/angular/src/status-store.ts`).
2. **Create a session** — `createSignalRSession({ hubs, resolve, statusStore, getAccessToken, onStatusChange, onError })`. This is the single call that replaces what used to be ~35 duplicated lines per provider.
3. **Expose `session.context`** through the framework's context mechanism (React/Solid/Preact context, Svelte's `setContext`, an Angular injection token, Vue `provide`, Lit's shared session object). `session.context` has a stable identity — build it once.
4. **On identity change** (`baseUrl`, `enabled`, or `connectionKey`), call `session.stop()` then, if enabled and a `baseUrl` is present, `session.start(baseUrl)`. This is the only place an adapter touches connection lifecycle directly.
5. **On teardown** (unmount / cleanup / destroy), call `session.stop()`.

The hook-level contract is symmetric and framework-independent:

- Every hook that touches a hub calls `acquire(hub)` at setup and `release(hub)` at teardown (see `useHubConsumer` in each adapter's `create-hooks.ts`). This is what makes lazy hubs ref-counted correctly regardless of how many hooks a component uses.
- Hooks call into `createInvoker` / `createSender` / `createTeardownSender` (`packages/core/src/calls.ts`) rather than reimplementing invoke/send/teardown semantics.

## Subscription model

Status is exposed as one per-hub signal/store, not a single global status object, so that a consumer watching hub A's status is never notified when hub B's status changes — an update to one hub must not cause a re-render/re-run in components that only care about another hub. Each adapter's `StatusStore` enforces this by keying its underlying reactive primitive (a React external store, a Solid signal, a Svelte writable) per hub.

The same granularity rule applies to events: a consumer of event X on a hub must not be notified when event Y fires on that hub. This falls out naturally because event handlers are attached directly to the underlying `HubConnection` per `(hub, event)` pair (`connection.on(event, listener)`), not routed through a shared dispatcher.

## Lazy connection semantics

A hub configured `lazy: true` connects only when first acquired and disconnects after its last release, subject to a grace period:

- `acquire(hub)` increments a ref count; the transition from 0 to 1 triggers `reconcile()`, which builds and starts the connection if it is now desired.
- `release(hub)` decrements the ref count; the transition to 0 triggers `reconcile()`, which schedules a stop.
- The stop is scheduled via `queueMicrotask` when `graceMs <= 0`, or `setTimeout(stopNow, graceMs)` otherwise. If the hub is re-acquired before the timer fires, the scheduled stop checks the current ref count and backs off.
- Ref counts, pending stop timers, and reconnect listeners are stored in `Map`s owned by the session and are **not** recreated on `stop()`/`start()` — they survive a full rebuild. A consumer that acquired a hub before a `baseUrl` change keeps it desired in the new generation without re-acquiring.

## SSR requirements

No connection work happens at module scope or during a synchronous render/setup pass. `createSignalRSession` itself does no I/O on construction — `session.start()` must be called explicitly. Each adapter defers that call to a client-only lifecycle hook:

- React: inside `useEffect`.
- Solid: inside `createEffect` (which does not run during SSR render).
- Svelte: inside `onMount`.
- Angular: inside `afterNextRender`, which never runs on the server.
- Vue: the plugin skips its `effectScope` when `typeof window === "undefined"`.
- Preact: inside `useEffect`, which does not run during server rendering.
- Lit: inside `ReactiveController.hostConnected()`.

A server render therefore never opens a socket. Every hub reports `"disconnected"` until a client-side lifecycle hook calls `session.start()`.

## Type-safety requirements

All type inference flows from the `hubs` object passed to `createSignalRClient` / `SignalRClientConfig`. Event and method signatures are declared once with `event<Args>()` / `method<Args, Return>()` and flow through `InferContract`, `EventArgs`, `MethodArgs`, `MethodReturn`, `EventName`, and `MethodName` (all exported from `packages/core/src/types.ts`) into every hook's parameters and return type.

Adapters must not introduce `any` or untyped casts. Reuse the exported generic building blocks instead of redeclaring them:

- `SignalRContract`, `HubString`, `HubConnectionStatus` — the shape of a contract and its runtime states.
- `SignalRSession<T, TStore>`, `SignalRSessionDeps<T, TStore>` — the session an adapter builds its provider around; `TStore` lets an adapter's own `StatusStore` subtype (e.g. one with a React `subscribe`) flow through to `session.context` untyped-erased.
- `SignalRContextValueBase<T, TStore>`, `SignalRProviderPropsBase<TChildren>` — the base shapes an adapter's `SignalRContextValue<T>` / `SignalRProviderProps` extend with framework-specific pieces (a `ReactNode` children type, a framework-specific store).
- `ConnectionManager<Hub>`, `StatusStore<H>` — the lower-level primitives the session composes, exported for adapters that need to go around the session (uncommon).

## New adapter checklist

Building a new adapter:

1. Implement `StatusStore<H>` for the framework's reactivity (`get`/`set`, plus whatever subscription primitive the framework needs — see `packages/react/src/status-store.ts`, `packages/solid/src/status-store.ts`, and `packages/svelte/src/status-store.ts` for three different shapes of the same contract).
2. Create a session per client with `createSignalRSession({ hubs, resolve, statusStore, getAccessToken, onStatusChange, onError })`.
3. Wire `session.context` into the framework's context/injection mechanism, built once per provider instance.
4. Bind lifecycle: call `session.start(baseUrl)` / `session.stop()` from a client-only reactive effect keyed on `baseUrl`/`enabled`/`connectionKey`, and `session.stop()` on teardown.
5. Map the provider plus the 8 hooks/equivalents onto the framework's primitives, delegating to core: `useSignalR`, `useHubConsumer`, `useHubStatus`, `useOnReconnected`, `useSignalREffect`, `useSignalRInvoke` (`createInvoker`), `useSignalRSend` (`createSender`), `useSignalRTeardown` (`createTeardownSender`).
6. Name the public surface with the target framework's vocabulary — see [Naming conventions](#naming-conventions).
7. Add a type-test file proving inference flows end to end from a sample contract (see `packages/*/src/**/*.type-test.ts`).
8. Add lifecycle tests (mount/unmount rebuild, SSR-safe no-op) and ref-count tests (lazy connect/disconnect, grace period, survival across a rebuild) — mirror `packages/core/src/session.test.ts` and the existing adapters' provider tests.
9. Add a package README documenting install and usage for the new framework.
10. Register the package: add it to `packages/`, add its build step to the root `build` script, add its publish step to `.github/workflows/release.yml`, and add its README to `requiredReadmes` in `scripts/check-docs.mjs`.

## Naming conventions

The core's concepts are fixed: provide/context, raw context access, hub status, server events, invoke, send, teardown, reconnect, keep-alive. Each adapter names its public surface using its own framework's vocabulary. An API that reads foreign is a tax on every consumer — a Svelte developer expects stores, not `useX`; a React developer expects hooks; an Angular developer expects services and Observables. The rename is free before an adapter ships, and it is what "framework-idiomatic" means in practice.

| Concept | React / Solid / Preact | Svelte | Angular | Vue | Lit |
| --- | --- | --- | --- | --- | --- |
| provide/context | `SignalRProvider` | `provideSignalR` | `provideSignalR` | configured client plugin (`install`) | explicit shared `createSession` |
| raw context access | `useSignalR` | `getSignalR` | `injectSignalR` | `useSignalR` | `session.context` |
| hub status | `useHubStatus` | `hubStatus` | `injectHubStatus` (`Signal<HubConnectionStatus>`) | `useHubStatus` (ref) | `controller.status` |
| server event | `useSignalREffect` | `onHubEvent` | `injectHubEvent` | `useSignalREvent` | `controller.on` |
| invoke | `useSignalRInvoke` | `hubInvoke` | `injectHubInvoke` | `useSignalRInvoke` | `controller.invoke` |
| send | `useSignalRSend` | `hubSend` | `injectHubSend` | `useSignalRSend` | `controller.send` |
| teardown | `useSignalRTeardown` | `hubTeardown` | `injectHubTeardown` | `useSignalRTeardown` | `controller.teardown` |
| reconnect hook | `useOnReconnected` | `onReconnected` | `injectOnReconnected` | `useOnReconnected` | `controller.onReconnected` |
| keep lazy hub alive | `useHubConsumer` | `keepHubAlive` | `injectKeepHubAlive` | `useHubConsumer` | controller host lifecycle |

React, Solid, and Preact keep `use*` because that vocabulary is native to them. The Preact adapter uses `preact` and `preact/hooks` only. Svelte stores are nouns, and context access follows `getContext`. Angular uses `inject*` and `provideSignalR`. Vue installs the configured client through `app.use` and exposes `use*` composables. Lit uses Reactive Controllers and an explicit shared session, without a global provider element.

The exported *type* names and `createSignalRClient`, `event`, `method` stay identical across all adapters — they are core concepts, not framework surface.
