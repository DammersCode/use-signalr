# Changelog

## 0.2.0

### Added

- **`useSignalRTeardown(hub, method, options?)`** — a reliable teardown sender
  for a method called in an effect cleanup. Unlike `useSignalRSend` (drops if
  not yet connected) and `useSignalRInvoke` (aborts in-flight calls on unmount),
  it survives the calling component's unmount, queues while the hub is still
  connecting (flushes on connect, up to `timeout`), and holds a lazy hub open
  until the flush completes. Best-effort fire-and-forget: resolves `true` when
  dispatched, `false` if the hub never connected in time; never throws. Fixes
  stranded server-side session state under React StrictMode and fast route
  switches. **New public export.**
- **`InvokeOptions.keepAliveOnUnmount`** — opt-out on `useSignalRInvoke`: when
  `true`, an in-flight call (including a mid-backoff retry) is **not** aborted
  when the calling component unmounts. Default `false` (unchanged behavior).
  Covers the abort-on-unmount half only; for the still-connecting race, prefer
  `useSignalRTeardown`.
- **`TeardownOptions`** type — exported (`{ timeout?: number }`).

### Changed

- **Public API surface:** `createSignalRClient()` now also returns
  `useSignalRTeardown`. `InvokeOptions` gains the optional `keepAliveOnUnmount`
  field. Both additive — existing `useSignalRInvoke` / `useSignalRSend` behavior
  is unchanged for current callers.

### Internal

- Added a Vitest + Testing Library + jsdom test setup (dev-only; no new peer
  deps, `sideEffects: false` preserved). Tests cover the mid-backoff
  abort-vs-keep-alive distinction and the queue-while-connecting leave.
