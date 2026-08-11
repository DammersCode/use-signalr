# @dammers/use-signalr-lit

Typed SignalR Reactive Controllers for Lit. A session shares core connections between custom elements.

[![npm](https://img.shields.io/npm/v/@dammers/use-signalr-lit.svg)](https://www.npmjs.com/package/@dammers/use-signalr-lit)
[![types](https://img.shields.io/badge/types-included-blue.svg)](#api)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

```ts
const { createSession } = createSignalRClient({
  hubs: {
    "/hubs/chat": {
      methods: { Join: method<[room: string]>() },
    },
  },
});
```

One factory call infers every hub, event, method, argument, and result type. Reactive Controllers adapt the shared core session to Lit.

The [root README](https://github.com/DammersCode/use-signalr#readme) documents shared configuration and call behavior. This document covers Lit-specific installation and usage.

## Install

```bash
npm i @dammers/use-signalr-lit @microsoft/signalr lit
```

This package requires Lit 3 or later. It does not require `@lit/context`.

## Usage

### 1. Define the contract and create a shared session

Create the client once. Then create and export one shared session for the application.

```ts
import { createSignalRClient, event, method } from "@dammers/use-signalr-lit";

export const signalR = createSignalRClient({
  hubs: {
    "/hubs/chat": {
      lazy: true,
      events: { Receive: event<[user: string, text: string]>() },
      methods: {
        Join: method<[room: string]>(),
        Typing: method<[room: string]>(),
        Leave: method<[room: string]>(),
      },
    },
  },
});

export const signalRSession = signalR.createSession({
  baseUrl: "https://api.example.com",
  accessTokenFactory: () => getAccessToken(),
});
```

The factory does not start connections. The first connected controller starts the shared session.

### 2. Attach a hub controller

Create one hub controller in each custom element that uses a hub.

```ts
import { LitElement, html } from "lit";
import { signalRSession } from "./signalr";

class ChatView extends LitElement {
  private readonly chat = signalRSession.hub(this, "/hubs/chat", {
    reactiveStatus: true,
  });
  private readonly join = this.chat.invoke("Join");
  private readonly leave = this.chat.teardown("Leave");

  constructor() {
    super();
    this.chat.on("Receive", (user, text) => console.log(user, text));
    this.chat.onReconnected(() => this.loadMessages());
  }

  render() { return html`<p>${this.chat.status}</p>`; }
}
customElements.define("chat-view", ChatView);
```

The controller acquires the lazy hub in `hostConnected()`. It releases the hub and event listeners in `hostDisconnected()`.

### 3. Invoke, send, and teardown

The call factories preserve the method types from the contract.

```ts
private readonly join = this.chat.invoke("Join");
private readonly typing = this.chat.send("Typing");
private readonly leave = this.chat.teardown("Leave");

async enterRoom(room: string) {
  await this.join(room);
}

override disconnectedCallback() {
  super.disconnectedCallback();
  void this.leave("general");
}
```

## Reactive and imperative events

Set `reactiveStatus: true` when status changes must render the host. The controller requests updates only for that hub. Events are imperative. An event handler does not request a render. Call `this.requestUpdate()` in the handler when event data changes rendered state.

`on(event, handler)` returns an unsubscribe function. Multiple handlers can use the same event. `onReconnected(callback)` runs after reconnect.

## Calls and lazy hubs

`invoke(method, options?)` waits for a connection and returns the typed result. It aborts pending retry work when the host disconnects unless `keepAliveOnUnmount` is true.

`send(method)` returns `false` when the hub is disconnected. `teardown(method, options?)` waits for a connection and remains active after host disconnection. Use teardown calls for leave operations.

Lazy hubs connect when a controller host connects. They stop after all hosts disconnect and the configured grace period passes. Eager hubs remain active until `signalRSession.stop()` runs.

## Sharing across custom elements

Export the session from a normal module. Import the same session into each custom element that needs SignalR.

This pattern does not require a global application root or `@lit/context`. Components in separate DOM trees can share the same session instance.

Create a different session when an application needs an independent base URL or authentication boundary. Call `signalRSession.stop()` during logout or application shutdown.

The current token is read through `accessTokenFactory` during each negotiation. Token rotation does not create a new session.

## SSR

Package import, client creation, session creation, and controller construction do not start connections. Lit calls `hostConnected()` only in the browser.

## API

| Export | Description |
| --- | --- |
| `createSignalRClient(config)` | Creates a typed client factory. |
| `createSession(options)` | Creates an explicit shared runtime session. |
| `session.hub(host, hub, options?)` | Creates a per-hub Reactive Controller. |
| `controller.status` | Reads the current hub status. |
| `controller.on()` | Registers a typed imperative event handler. |
| `controller.invoke()` | Creates a typed invoker. |
| `controller.send()` | Creates a typed lossy sender. |
| `controller.teardown()` | Creates a typed reliable teardown sender. |
| `controller.onReconnected()` | Registers a callback that runs after reconnect. |
| `session.stop()` | Stops all connections in the shared session. |

## More

Read the [root README](https://github.com/DammersCode/use-signalr#readme) for shared connection options and retry behavior.
