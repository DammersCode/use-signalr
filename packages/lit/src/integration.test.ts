import { html, LitElement } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { event, method } from "@dammers/use-signalr-core";
import type { HubConnectionStatus } from "@dammers/use-signalr-core";
import { createSignalRClient } from "./create-signalr-client.js";

type Listener = (...args: unknown[]) => void;

interface FakeConnection {
  url: string;
  accessTokenFactory?: () => unknown;
  state: string;
  handlers: Map<string, Listener[]>;
  on: (name: string, listener: Listener) => void;
  off: ReturnType<typeof vi.fn>;
  start: () => Promise<void>;
  stop: ReturnType<typeof vi.fn>;
  onclose: (listener: Listener) => void;
  onreconnecting: (listener: Listener) => void;
  onreconnected: (listener: Listener) => void;
  invoke: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  lifecycle: { reconnecting?: Listener; reconnected?: Listener };
}

let connections: FakeConnection[] = [];
let deferStart = false;
let startResolvers: Array<() => void> = [];

function fakeConnection(url: string, accessTokenFactory?: () => unknown): FakeConnection {
  const connection: FakeConnection = {
    url,
    accessTokenFactory,
    state: "Disconnected",
    handlers: new Map(),
    lifecycle: {},
    on: (name, listener) => {
      connection.handlers.set(name, [...(connection.handlers.get(name) ?? []), listener]);
    },
    off: vi.fn(),
    start: () => {
      if (!deferStart) {
        connection.state = "Connected";
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        startResolvers.push(() => {
          connection.state = "Connected";
          resolve();
        });
      });
    },
    stop: vi.fn(() => Promise.resolve()),
    onclose: () => {},
    onreconnecting: (listener) => {
      connection.lifecycle.reconnecting = listener;
    },
    onreconnected: (listener) => {
      connection.lifecycle.reconnected = listener;
    },
    invoke: vi.fn(() => Promise.resolve(7)),
    send: vi.fn(() => Promise.resolve()),
  };
  return connection;
}

vi.mock("@microsoft/signalr", () => {
  class HubConnectionBuilder {
    private url = "";
    private accessTokenFactory?: () => unknown;
    withUrl(url: string, options?: { accessTokenFactory?: () => unknown }) {
      this.url = url;
      this.accessTokenFactory = options?.accessTokenFactory;
      return this;
    }
    configureLogging() { return this; }
    withAutomaticReconnect() { return this; }
    build() {
      const connection = fakeConnection(this.url, this.accessTokenFactory);
      connections.push(connection);
      return connection;
    }
  }
  return {
    AbortError: class AbortError extends Error {},
    HubConnectionBuilder,
    HubConnectionState: {
      Disconnected: "Disconnected",
      Connecting: "Connecting",
      Connected: "Connected",
      Reconnecting: "Reconnecting",
    },
    LogLevel: { Information: 2 },
  };
});

const push = (connection: FakeConnection, name: string, ...args: unknown[]) =>
  connection.handlers.get(name)?.forEach((listener) => listener(...args));
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const finishStart = () => startResolvers.splice(0).forEach((resolve) => resolve());
const reconnect = (connection: FakeConnection) => {
  connection.lifecycle.reconnecting?.();
  connection.lifecycle.reconnected?.();
};

let elementId = 0;
const define = (constructor: CustomElementConstructor) => {
  const name = `lit-integration-${elementId++}`;
  customElements.define(name, constructor);
  return name;
};

afterEach(async () => {
  document.body.replaceChildren();
  await tick();
  connections = [];
  deferStart = false;
  startResolvers = [];
});

function setup(
  options: {
    graceMs?: number;
    onError?: (hub: string, error: unknown) => void;
    onStatusChange?: (hub: string, status: HubConnectionStatus) => void;
  } = {},
) {
  const client = createSignalRClient({
    hubs: {
      "/hub": {
        lazy: true,
        graceMs: options.graceMs ?? 0,
        events: { Tick: event<[value: number]>() },
        methods: { Count: method<[], number>() },
      },
    },
  });
  const session = client.createSession({
    baseUrl: "https://example.test",
    accessTokenFactory: () => "token",
    onError: options.onError,
    onStatusChange: options.onStatusChange,
  });
  const handler = vi.fn();
  const reconnected = vi.fn();
  class Host extends LitElement {
    controller = session.hub(this, "/hub");
    stopEvent = this.controller.on("Tick", handler);
    stopReconnect = this.controller.onReconnected(reconnected);
    render() { return html``; }
  }
  const host = document.createElement(define(Host)) as Host;
  return { session, host, handler, reconnected };
}

describe("Lit integration with the real session", () => {
  it("S1: an invoke from the constructor resolves after the connect", async () => {
    deferStart = true;
    const client = createSignalRClient({
      hubs: { "/hub": { lazy: true, methods: { Count: method<[], number>() } } },
    });
    const session = client.createSession({
      baseUrl: "https://example.test",
      accessTokenFactory: () => "token",
    });
    let result!: Promise<number>;
    class Host extends LitElement {
      controller = session.hub(this, "/hub");
      constructor() {
        super();
        result = this.controller.invoke("Count")();
      }
    }
    const host = document.createElement(define(Host)) as Host;
    document.body.append(host);
    await host.updateComplete;
    await tick();
    finishStart();
    await expect(result).resolves.toBe(7);
    session.stop();
  });

  it("S2: an event pushed in the same task as the connect reaches the handler", async () => {
    deferStart = true;
    const { session, host, handler } = setup();
    document.body.append(host);
    await host.updateComplete;
    const connection = connections[0]!;

    push(connection, "Tick", 1);
    finishStart();
    push(connection, "Tick", 2);
    await tick();
    push(connection, "Tick", 3);

    expect(handler.mock.calls).toEqual([[1], [2], [3]]);
    session.stop();
  });

  it("S3: an event pushed right after an auto-reconnect reaches the handler", async () => {
    const { session, host, handler, reconnected } = setup();
    document.body.append(host);
    await host.updateComplete;
    await tick();
    const connection = connections[0]!;

    reconnect(connection);
    push(connection, "Tick", 9);

    expect(handler).toHaveBeenCalledWith(9);
    expect(reconnected).toHaveBeenCalledTimes(1);
    session.stop();
  });

  it("keeps a shared reconnect callback for the other consumer when one unregisters", async () => {
    const { session, host, reconnected } = setup();
    document.body.append(host);
    await host.updateComplete;
    await tick();
    const stopSecond = host.controller.onReconnected(reconnected);

    stopSecond();
    reconnect(connections[0]!);

    expect(reconnected).toHaveBeenCalledTimes(1);
    session.stop();
  });

  it("S4: a throwing reconnect callback leaves the status connected and events flowing", async () => {
    const onError = vi.fn();
    const { session, host, handler } = setup({ onError });
    host.controller.onReconnected(() => {
      throw new Error("boom");
    });
    document.body.append(host);
    await host.updateComplete;
    await tick();
    const connection = connections[0]!;

    reconnect(connection);
    push(connection, "Tick", 4);

    expect(session.context.getStatus("/hub")).toBe("connected");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(4);
    session.stop();
  });

  it("S5: an update with equal values or only a new token factory does not rebuild", async () => {
    const { session, host } = setup();
    document.body.append(host);
    await host.updateComplete;
    await tick();

    session.update({ baseUrl: "https://example.test", enabled: true });
    session.update({ accessTokenFactory: () => "other" });
    await tick();

    expect(connections).toHaveLength(1);
    expect(connections[0]!.stop).not.toHaveBeenCalled();
    session.stop();
  });

  it("S6: a connectionKey change rebuilds once, the rebuild runs the reconnect callback, and the event handler stays", async () => {
    const { session, host, handler, reconnected } = setup();
    document.body.append(host);
    await host.updateComplete;
    await tick();

    session.update({ connectionKey: "next" });
    await tick();
    expect(connections).toHaveLength(2);
    expect(connections[0]!.stop).toHaveBeenCalledTimes(1);

    push(connections[1]!, "Tick", 6);
    expect(handler).toHaveBeenCalledWith(6);
    expect(reconnected).toHaveBeenCalledTimes(1);
    reconnect(connections[1]!);
    expect(reconnected).toHaveBeenCalledTimes(2);
    session.stop();
  });

  it("S7: removing the host while an invoke waits rejects with AbortError and sends nothing", async () => {
    deferStart = true;
    const { session, host } = setup();
    document.body.append(host);
    await host.updateComplete;
    const outcome = host.controller
      .invoke("Count")()
      .catch((error: unknown) => error);

    host.remove();
    finishStart();
    await tick();

    expect(await outcome).toMatchObject({ name: "AbortError" });
    expect(connections[0]!.invoke).not.toHaveBeenCalled();
    session.stop();
  });

  it("holds a lazy hub for a keepAliveOnUnmount invoke after the host disconnects", async () => {
    deferStart = true;
    const { session, host } = setup();
    document.body.append(host);
    await host.updateComplete;
    const result = host.controller.invoke("Count", { keepAliveOnUnmount: true })();

    host.remove();
    await tick(10);
    expect(connections[0]!.stop).not.toHaveBeenCalled();

    finishStart();
    await expect(result).resolves.toBe(7);
    session.stop();
  });

  it("S8: the first connect publishes connecting and then connected", async () => {
    const seen: HubConnectionStatus[] = [];
    const { session, host } = setup({ onStatusChange: (_hub, status) => seen.push(status) });
    document.body.append(host);
    await host.updateComplete;
    await tick();
    expect(seen).toEqual(["connecting", "connected"]);
    session.stop();
  });

  it("S9: a lazy hub connects with the first host and stops after the last host plus graceMs", async () => {
    const { session, host } = setup({ graceMs: 20 });
    expect(connections).toHaveLength(0);
    document.body.append(host);
    await host.updateComplete;
    await tick();
    expect(connections).toHaveLength(1);

    host.remove();
    await tick(5);
    expect(connections[0]!.stop).not.toHaveBeenCalled();
    await tick(30);
    expect(connections[0]!.stop).toHaveBeenCalledTimes(1);
    session.stop();
  });

  it("moving the element in the DOM in one task keeps the connection and the handlers", async () => {
    const { session, host, handler, reconnected } = setup();
    const first = document.createElement("div");
    const second = document.createElement("div");
    document.body.append(first, second);
    first.append(host);
    await host.updateComplete;
    await tick();
    const connection = connections[0]!;

    second.append(host);
    await tick();

    expect(connections).toHaveLength(1);
    expect(connection.stop).not.toHaveBeenCalled();
    push(connection, "Tick", 5);
    reconnect(connection);
    expect(handler.mock.calls).toEqual([[5]]);
    expect(reconnected).toHaveBeenCalledTimes(1);
    session.stop();
  });

  it("moving the element in one task keeps a pending invoke alive", async () => {
    deferStart = true;
    const { session, host } = setup();
    const first = document.createElement("div");
    const second = document.createElement("div");
    document.body.append(first, second);
    first.append(host);
    await host.updateComplete;
    const outcome = host.controller.invoke("Count")();

    second.append(host);
    finishStart();
    await tick();

    expect(await outcome).toBe(7);
    session.stop();
  });

  it("update with an undefined accessTokenFactory keeps the old factory", async () => {
    const accessTokenFactory = vi.fn(() => "token");
    const client = createSignalRClient({ hubs: { "/hub": {} } });
    const session = client.createSession({ baseUrl: "https://example.test", accessTokenFactory });
    session.hub({ addController() {}, removeController() {}, requestUpdate() {}, updateComplete: Promise.resolve(true) }, "/hub").hostConnected();
    await tick();

    session.update({ accessTokenFactory: undefined, connectionKey: 1 });
    await tick();

    expect(connections).toHaveLength(2);
    expect(await connections[1]!.accessTokenFactory?.()).toBe("token");
    session.stop();
  });

  it("enabled false then true rebuilds the connection", async () => {
    const { session, host } = setup();
    document.body.append(host);
    await host.updateComplete;
    await tick();

    session.update({ enabled: false });
    await tick();
    session.update({ enabled: true });
    await tick();

    expect(connections).toHaveLength(2);
    expect(session.context.getStatus("/hub")).toBe("connected");
    session.stop();
  });

  it("an invoke on a disabled session rejects at once", async () => {
    const { session, host } = setup();
    session.update({ enabled: false });
    document.body.append(host);
    await host.updateComplete;

    await expect(host.controller.invoke("Count")()).rejects.toBeInstanceOf(Error);
    expect(connections).toHaveLength(0);
    session.stop();
  });

  it("stop during a connect, then update, connects again", async () => {
    deferStart = true;
    const { session, host } = setup();
    document.body.append(host);
    await host.updateComplete;

    session.stop();
    finishStart();
    await tick();
    deferStart = false;
    session.update({ connectionKey: 1 });
    await tick();

    expect(session.context.getStatus("/hub")).toBe("connected");
    session.stop();
  });
});
