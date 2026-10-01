# @dammers/use-signalr-angular

Providers and inject functions with signals for typed [SignalR](https://learn.microsoft.com/aspnet/core/signalr) in Angular. Part of [use-signalr](https://use-signalr.vercel.app).

[![npm](https://img.shields.io/npm/v/@dammers/use-signalr-angular.svg)](https://www.npmjs.com/package/@dammers/use-signalr-angular)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/DammersCode/use-signalr/blob/main/LICENSE)

## Install

```bash
npm install @dammers/use-signalr-angular @microsoft/signalr
```

It needs `@angular/core` ^20 || ^21 || ^22 (the optional `rxjs-interop` entry point also needs `rxjs` ^7.6), `@microsoft/signalr` ^8 || ^9 || ^10, and Node 20.19 or later.

## Example

This file declares a hub, connects it, and reads a typed method result:

<!-- hero:angular:start -->
```ts
import { Component, signal } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { createSignalRClient, method } from "@dammers/use-signalr-angular";

const { provideSignalR, injectHubInvoke } = createSignalRClient({
  hubs: {
    "/hubs/rooms": {
      methods: { GetHistory: method<[roomId: string], { text: string }[]>() },
    },
  },
});

@Component({ selector: "app-root", template: `<button (click)="load()">{{ count() }} messages</button>` })
export class HistoryCount {
  private getHistory = injectHubInvoke("/hubs/rooms", "GetHistory");
  count = signal(0);

  load() {
    this.getHistory("general").then((m) => this.count.set(m.length)).catch(console.error);
  }
}

bootstrapApplication(HistoryCount, {
  providers: [provideSignalR({ baseUrl: "https://api.example.com", accessTokenFactory: () => "token" })],
});
```
<!-- hero:angular:end -->

## Documentation

- [Quick start](https://use-signalr.vercel.app/docs/angular/quick-start)
- [Provider setup](https://use-signalr.vercel.app/docs/angular/concepts/provider)
- [Events](https://use-signalr.vercel.app/docs/angular/concepts/events) and [calls](https://use-signalr.vercel.app/docs/angular/concepts/calls)
- [Connection status](https://use-signalr.vercel.app/docs/angular/concepts/connection-status) and [recovery](https://use-signalr.vercel.app/docs/angular/concepts/recovery)
- [API reference](https://use-signalr.vercel.app/docs/angular/reference/api)
- [Troubleshooting](https://use-signalr.vercel.app/docs/angular/reference/troubleshooting)

## License

[MIT](https://github.com/DammersCode/use-signalr/blob/main/LICENSE) © [DammersCode](https://github.com/DammersCode)
