# @dammers/use-signalr-lit

Reactive controllers for typed [SignalR](https://learn.microsoft.com/aspnet/core/signalr) in Lit. Part of [use-signalr](https://use-signalr.vercel.app).

[![npm](https://img.shields.io/npm/v/@dammers/use-signalr-lit.svg)](https://www.npmjs.com/package/@dammers/use-signalr-lit)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/DammersCode/use-signalr/blob/main/LICENSE)

## Install

```bash
npm install @dammers/use-signalr-lit @microsoft/signalr
```

It needs Lit ^3, `@microsoft/signalr` ^8 || ^9 || ^10, and Node 20.19 or later.

## Example

This file declares a hub, connects it, and reads a typed method result:

<!-- hero:lit:start -->
```ts
import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { createSignalRClient, method } from "@dammers/use-signalr-lit";

const { createSession } = createSignalRClient({
  hubs: {
    "/hubs/rooms": {
      methods: { GetHistory: method<[roomId: string], { text: string }[]>() },
    },
  },
});
const session = createSession({ baseUrl: "https://api.example.com", accessTokenFactory: () => "token" });

@customElement("history-count")
export class HistoryCount extends LitElement {
  private rooms = session.hub(this, "/hubs/rooms");
  private getHistory = this.rooms.invoke("GetHistory");
  @state() private count = 0;

  private load() {
    this.getHistory("general").then((m) => (this.count = m.length)).catch(console.error);
  }

  render() {
    return html`<button @click=${this.load}>${this.count} messages</button>`;
  }
}
```
<!-- hero:lit:end -->

## Documentation

- [Quick start](https://use-signalr.vercel.app/docs/lit/quick-start)
- [Session setup](https://use-signalr.vercel.app/docs/lit/concepts/provider)
- [Events](https://use-signalr.vercel.app/docs/lit/concepts/events) and [calls](https://use-signalr.vercel.app/docs/lit/concepts/calls)
- [Connection status](https://use-signalr.vercel.app/docs/lit/concepts/connection-status) and [recovery](https://use-signalr.vercel.app/docs/lit/concepts/recovery)
- [API reference](https://use-signalr.vercel.app/docs/lit/reference/api)
- [Troubleshooting](https://use-signalr.vercel.app/docs/lit/reference/troubleshooting)

## License

[MIT](https://github.com/DammersCode/use-signalr/blob/main/LICENSE) © [DammersCode](https://github.com/DammersCode)
