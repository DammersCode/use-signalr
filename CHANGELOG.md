# Changelog

## Unreleased

## 1.1.0

- Support `@microsoft/signalr` 11 in all packages.
- Support Solid 2 next to Solid 1 in `@dammers/use-signalr-solid`.
- Change `stop()` so that a teardown call in flight on a connected hub is sent before its connection closes. If the hub has not connected yet, the stop ends the wait and the call resolves `false` at once. The timeout of a teardown call now covers the send as well. `createTeardownSender` takes an optional `beginSend` in its `target`. The Vue plugin stops the session one microtask after `app.unmount()`.
- Fix the Angular provider losing the error of an `onStatusChange` that returns a rejected promise. It now reaches `onError`, as in the other adapters.

## 1.0.0

First stable release. Typed SignalR hooks for React, Vue, Angular, Svelte, Preact, Solid, and Lit on one shared core.

Documentation: https://use-signalr.vercel.app
