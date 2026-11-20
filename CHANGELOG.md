# Changelog

## Unreleased

- Support `@microsoft/signalr` 11 in all packages.
- Support Solid 2 next to Solid 1 in `@dammers/use-signalr-solid`.
- Fix the Angular provider losing the error of an `onStatusChange` that returns a rejected promise. It now reaches `onError`, as in the other adapters.

## 1.0.0

First stable release. Typed SignalR hooks for React, Vue, Angular, Svelte, Preact, Solid, and Lit on one shared core.

Documentation: https://use-signalr.vercel.app
