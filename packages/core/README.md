# @dammers/use-signalr-core

The framework-free core of [use-signalr](https://use-signalr.vercel.app): connection lifecycle, the hub contract, recovery, and call helpers for typed [SignalR](https://learn.microsoft.com/aspnet/core/signalr).

[![npm](https://img.shields.io/npm/v/@dammers/use-signalr-core.svg)](https://www.npmjs.com/package/@dammers/use-signalr-core)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/DammersCode/use-signalr/blob/main/LICENSE)

This package is for adapter authors. To use SignalR in an app, install the adapter for your framework:

| Package | Framework |
| --- | --- |
| [`@dammers/use-signalr-react`](https://use-signalr.vercel.app/docs/react) | React |
| [`@dammers/use-signalr-vue`](https://use-signalr.vercel.app/docs/vue) | Vue |
| [`@dammers/use-signalr-angular`](https://use-signalr.vercel.app/docs/angular) | Angular |
| [`@dammers/use-signalr-svelte`](https://use-signalr.vercel.app/docs/svelte) | Svelte |
| [`@dammers/use-signalr-preact`](https://use-signalr.vercel.app/docs/preact) | Preact |
| [`@dammers/use-signalr-solid`](https://use-signalr.vercel.app/docs/solid) | Solid |
| [`@dammers/use-signalr-lit`](https://use-signalr.vercel.app/docs/lit) | Lit |

## Install

```bash
npm install @dammers/use-signalr-core @microsoft/signalr
```

It needs `@microsoft/signalr` ^8 || ^9 || ^10 and Node 20.19 or later. It has no runtime dependencies.

## Documentation

- [Build an adapter](https://use-signalr.vercel.app/docs/core/build-an-adapter)
- [API reference](https://use-signalr.vercel.app/docs/core/reference/api)

## License

[MIT](https://github.com/DammersCode/use-signalr/blob/main/LICENSE) © [DammersCode](https://github.com/DammersCode)
