import { html, LitElement } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { event, method } from "@dammers/use-signalr-core";
import { createSignalRClient } from "./create-signalr-client";

interface FakeConnection {
  url: string;
  state: string;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onclose: ReturnType<typeof vi.fn>;
  onreconnecting: ReturnType<typeof vi.fn>;
  onreconnected: ReturnType<typeof vi.fn>;
  invoke: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
}

let connections: FakeConnection[] = [];
let deferStart = false;
let startResolvers: Array<() => void> = [];

function fakeConnection(url: string): FakeConnection {
  const connection = {
    url,
    state: "Disconnected",
    on: vi.fn(),
    off: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(() => Promise.resolve()),
    onclose: vi.fn(),
    onreconnecting: vi.fn(),
    onreconnected: vi.fn(),
    invoke: vi.fn(() => Promise.resolve(7)),
    send: vi.fn(() => Promise.resolve()),
  } as FakeConnection;
  connection.start.mockImplementation(() => {
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
  });
  return connection;
}

vi.mock("@microsoft/signalr", () => {
  class HubConnectionBuilder {
    private url = "";
    withUrl(url: string) {
      this.url = url;
      return this;
    }
    configureLogging() { return this; }
    withAutomaticReconnect() { return this; }
    build() {
      const connection = fakeConnection(this.url);
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

let elementId = 0;
const define = (constructor: CustomElementConstructor) => {
  const name = `lit-signalr-${elementId++}`;
  customElements.define(name, constructor);
  return name;
};
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(async () => {
  document.body.replaceChildren();
  await tick();
  connections = [];
  deferStart = false;
  startResolvers = [];
});

function runtime(graceMs = 0) {
  const client = createSignalRClient({
    hubs: {
      "/hub": {
        lazy: true,
        graceMs,
        events: { Tick: event<[value: number]>() },
        methods: { Count: method<[], number>() },
      },
    },
  });
  return client.createSession({
    baseUrl: "https://example.test",
    accessTokenFactory: () => "token",
  });
}

describe("Lit hub controller", () => {
  it("shares one lazy connection and honors the final-release grace period", async () => {
    const session = runtime(15);
    class Host extends LitElement {
      controller = session.hub(this, "/hub");
      render() { return html``; }
    }
    const name = define(Host);
    const first = document.createElement(name) as Host;
    const second = document.createElement(name) as Host;
    document.body.append(first, second);
    await Promise.all([first.updateComplete, second.updateComplete]);

    expect(connections).toHaveLength(1);
    first.remove();
    await tick(20);
    expect(connections[0]!.stop).not.toHaveBeenCalled();
    second.remove();
    await tick(5);
    document.body.append(second);
    await second.updateComplete;
    await tick(20);
    expect(connections[0]!.stop).not.toHaveBeenCalled();
    second.remove();
    await tick(20);
    expect(connections[0]!.stop).toHaveBeenCalledTimes(1);
    session.stop();
  });

  it("updates only the host that opted into the changed hub status", async () => {
    const client = createSignalRClient({
      hubs: { "/a": { lazy: true }, "/b": { lazy: true } },
    });
    const session = client.createSession({
      baseUrl: "https://example.test",
      accessTokenFactory: () => "token",
    });
    let rendersA = 0;
    let rendersB = 0;
    class HostA extends LitElement {
      controller = session.hub(this, "/a", { reactiveStatus: true });
      render() { rendersA += 1; return html`${this.controller.status}`; }
    }
    class HostB extends LitElement {
      controller = session.hub(this, "/b", { reactiveStatus: true });
      render() { rendersB += 1; return html`${this.controller.status}`; }
    }
    const a = document.createElement(define(HostA)) as HostA;
    const b = document.createElement(define(HostB)) as HostB;
    document.body.append(a, b);
    await Promise.all([a.updateComplete, b.updateComplete]);
    const beforeA = rendersA;
    const beforeB = rendersB;

    session.context.statusStore.set("/b", "reconnecting");
    await b.updateComplete;
    expect(rendersA).toBe(beforeA);
    expect(rendersB).toBeGreaterThan(beforeB);
    a.remove();
    b.remove();
    session.stop();
  });

  it("keeps events imperative and reattaches once after reconnect", async () => {
    const session = runtime(15);
    const handler = vi.fn();
    const reconnected = vi.fn();
    let renders = 0;
    class Host extends LitElement {
      controller = session.hub(this, "/hub");
      stopEvent = this.controller.on("Tick", handler);
      stopReconnect = this.controller.onReconnected(reconnected);
      render() { renders += 1; return html``; }
    }
    const host = document.createElement(define(Host)) as Host;
    document.body.append(host);
    await host.updateComplete;
    await tick();
    const connection = connections[0]!;
    const eventCalls = () => connection.on.mock.calls.filter(([name]) => name === "Tick");
    const listener = eventCalls().at(-1)![1] as (value: number) => void;
    const beforeEvent = renders;

    listener(5);
    await host.updateComplete;
    expect(handler).toHaveBeenCalledWith(5);
    expect(renders).toBe(beforeEvent);

    const reconnecting = connection.onreconnecting.mock.calls[0]![0] as () => void;
    const reconnect = connection.onreconnected.mock.calls[0]![0] as () => void;
    reconnecting();
    expect(connection.off).toHaveBeenCalledWith("Tick", listener);
    reconnect();
    expect(reconnected).toHaveBeenCalledTimes(1);
    expect(eventCalls()).toHaveLength(3); // core noop, initial listener, reattached listener

    const reattachedListener = eventCalls().at(-1)![1] as (value: number) => void;
    host.remove();
    expect(connection.off).toHaveBeenCalledWith("Tick", reattachedListener);
    document.body.append(host);
    await host.updateComplete;
    reconnect();
    expect(reconnected).toHaveBeenCalledTimes(2);
    const finalListener = eventCalls().at(-1)![1] as (value: number) => void;
    session.stop();
    expect(connection.off).toHaveBeenCalledWith("Tick", finalListener);
    host.stopEvent();
    host.stopReconnect();
    host.remove();
  });

  it("delegates invoke and send, including a disconnected send", async () => {
    const session = runtime();
    let controller!: ReturnType<typeof session.hub>;
    class Host extends LitElement {
      constructor() {
        super();
        controller = session.hub(this, "/hub");
      }
    }
    const host = document.createElement(define(Host)) as Host;
    document.body.append(host);
    await host.updateComplete;
    await tick();
    const connection = connections[0]!;

    await expect(controller.invoke("Count")()).resolves.toBe(7);
    await expect(controller.send("Count")()).resolves.toBe(true);
    connection.state = "Disconnected";
    await expect(controller.send("Count")()).resolves.toBe(false);
    host.remove();
    session.stop();
  });

  it("queues teardown after disconnect until the hub finishes connecting", async () => {
    deferStart = true;
    const session = runtime();
    let controller!: ReturnType<typeof session.hub>;
    class Host extends LitElement {
      constructor() {
        super();
        controller = session.hub(this, "/hub");
      }
    }
    const host = document.createElement(define(Host)) as Host;
    document.body.append(host);
    await host.updateComplete;
    const connection = connections[0]!;
    const teardown = controller.teardown("Count");

    host.remove();
    const pending = teardown();
    expect(connection.send).not.toHaveBeenCalled();
    startResolvers.splice(0).forEach((resolve) => resolve());
    await expect(pending).resolves.toBe(true);
    expect(connection.send).toHaveBeenCalledWith("Count");
    session.stop();
  });

  it("aborts invoke retry on disconnect unless keep-alive is enabled", async () => {
    async function run(keepAliveOnUnmount: boolean) {
      const session = runtime(50);
      let controller!: ReturnType<typeof session.hub>;
      class Host extends LitElement {
        constructor() {
          super();
          controller = session.hub(this, "/hub");
        }
      }
      const host = document.createElement(define(Host)) as Host;
      document.body.append(host);
      await host.updateComplete;
      await tick();
      const connection = connections.at(-1)!;
      connection.invoke.mockRejectedValueOnce(new Error("transport drop"));
      const invoke = controller.invoke("Count", {
        retries: 1,
        backoff: [15],
        isRetriable: () => true,
        keepAliveOnUnmount,
      });
      const result = invoke().catch(() => undefined);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      host.remove();
      await tick(25);
      await result;
      session.stop();
      return connection.invoke.mock.calls.length;
    }

    expect(await run(false)).toBe(1);
    expect(await run(true)).toBe(2);
  });
});
