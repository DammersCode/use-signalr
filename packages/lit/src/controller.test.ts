import { html, LitElement } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { event, method } from "@dammers/use-signalr-core";
import { createSignalRClient } from "./create-signalr-client.js";

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
  accessTokenFactory?: () => Promise<string>;
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
    private options: { accessTokenFactory?: () => Promise<string> } = {};
    withUrl(url: string, options?: { accessTokenFactory?: () => Promise<string> }) {
      this.url = url;
      this.options = options ?? {};
      return this;
    }
    configureLogging() { return this; }
    withAutomaticReconnect() { return this; }
    build() {
      const connection = fakeConnection(this.url);
      connection.accessTokenFactory = this.options.accessTokenFactory;
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

    connections.find((c) => c.url.endsWith("/b"))!.onreconnecting.mock.calls[0]![0]();
    await b.updateComplete;
    expect(rendersA).toBe(beforeA);
    expect(rendersB).toBeGreaterThan(beforeB);
    a.remove();
    b.remove();
    session.stop();
  });

  it("keeps events imperative and delivers them through reconnects and host moves", async () => {
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
    const tickCalls = () => connection.on.mock.calls.filter(([name]) => name === "Tick");
    expect(tickCalls()).toHaveLength(1); // core binds one listener per declared event
    const listener = tickCalls()[0]![1] as (value: number) => void;
    const beforeEvent = renders;

    listener(5);
    await host.updateComplete;
    expect(handler).toHaveBeenCalledWith(5);
    expect(renders).toBe(beforeEvent);

    const reconnecting = connection.onreconnecting.mock.calls[0]![0] as () => void;
    const reconnect = connection.onreconnected.mock.calls[0]![0] as () => void;
    reconnecting();
    reconnect();
    expect(reconnected).toHaveBeenCalledTimes(1);
    expect(tickCalls()).toHaveLength(1);
    expect(connection.off).not.toHaveBeenCalled();
    listener(6);
    expect(handler).toHaveBeenCalledTimes(2);

    host.remove();
    listener(7);
    expect(handler).toHaveBeenCalledTimes(2);
    document.body.append(host);
    await host.updateComplete;
    listener(8);
    reconnect();
    expect(handler).toHaveBeenCalledTimes(3);
    expect(reconnected).toHaveBeenCalledTimes(2);

    host.stopEvent();
    listener(9);
    expect(handler).toHaveBeenCalledTimes(3);
    host.stopReconnect();
    host.remove();
    session.stop();
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

  it("invokes again after the host is removed and attached again", async () => {
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
    const connection = connections[0]!;
    const invoke = controller.invoke("Count");

    host.remove();
    document.body.append(host);
    await host.updateComplete;
    await tick();

    await expect(invoke()).resolves.toBe(7);
    expect(connection.invoke).toHaveBeenCalledWith("Count");
    session.stop();
  });
});

describe("Lit session control and controller lifecycle", () => {
  function hostOf(session: ReturnType<typeof runtime>) {
    class Host extends LitElement {
      controller = session.hub(this, "/hub");
      render() { return html`${this.controller.status}`; }
    }
    return document.createElement(define(Host)) as Host;
  }

  it("does not start a stopped session when a host connects", async () => {
    const session = runtime();
    session.stop();
    const host = hostOf(session);
    document.body.append(host);
    await host.updateComplete;
    await tick();
    expect(connections).toHaveLength(0);
  });

  it("starts a stopped session again after update()", async () => {
    const session = runtime();
    session.stop();
    const host = hostOf(session);
    document.body.append(host);
    await host.updateComplete;
    session.update({ baseUrl: "https://next.test" });
    await tick();
    expect(connections).toHaveLength(1);
    expect(connections[0]!.url).toBe("https://next.test/hub");
    session.stop();
  });

  it("rebuilds once when update() changes baseUrl and not when values are equal", async () => {
    const session = runtime();
    const host = hostOf(session);
    document.body.append(host);
    await host.updateComplete;
    await tick();
    expect(connections).toHaveLength(1);

    session.update({ baseUrl: "https://example.test" });
    session.update({ enabled: true });
    await tick();
    expect(connections).toHaveLength(1);

    session.update({ baseUrl: "https://next.test" });
    await tick();
    expect(connections).toHaveLength(2);
    expect(connections[1]!.url).toBe("https://next.test/hub");
    expect(connections[0]!.stop).toHaveBeenCalledTimes(1);
    session.stop();
  });

  it("rebuilds when update() changes connectionKey and stops when enabled is false", async () => {
    const session = runtime();
    const host = hostOf(session);
    document.body.append(host);
    await host.updateComplete;
    await tick();

    session.update({ connectionKey: "a" });
    await tick();
    expect(connections).toHaveLength(2);

    session.update({ enabled: false });
    await tick();
    expect(connections).toHaveLength(2);
    expect(connections[1]!.stop).toHaveBeenCalledTimes(1);
    session.stop();
  });

  it("merges values from update() before any host connects", async () => {
    const session = runtime();
    session.update({ baseUrl: "https://early.test" });
    const host = hostOf(session);
    document.body.append(host);
    await host.updateComplete;
    await tick();
    expect(connections).toHaveLength(1);
    expect(connections[0]!.url).toBe("https://early.test/hub");
    session.stop();
  });

  it("reads the newest accessTokenFactory set through update()", async () => {
    const session = runtime();
    session.update({ accessTokenFactory: () => "rotated" });
    const host = hostOf(session);
    document.body.append(host);
    await host.updateComplete;
    await tick();
    await expect(connections[0]!.accessTokenFactory!()).resolves.toBe("rotated");
    session.stop();
  });

  it("acquires the hub once when hostConnected runs twice", async () => {
    const session = runtime();
    const host = hostOf(session);
    document.body.append(host);
    await host.updateComplete;
    host.controller.hostConnected();
    host.remove();
    await tick();
    expect(connections[0]!.stop).toHaveBeenCalledTimes(1);
    session.stop();
  });

  it("releases the hub and detaches from the host on dispose()", async () => {
    const session = runtime();
    const host = hostOf(session);
    document.body.append(host);
    await host.updateComplete;
    await tick();

    host.controller.dispose();
    await tick();
    expect(connections[0]!.stop).toHaveBeenCalledTimes(1);
    host.remove();
    await tick();
    expect(connections[0]!.stop).toHaveBeenCalledTimes(1);
    session.stop();
  });

  it("renders the host on status changes by default and opts out with reactiveStatus false", async () => {
    const session = runtime();
    let defaultRenders = 0;
    let quietRenders = 0;
    class Default extends LitElement {
      controller = session.hub(this, "/hub");
      render() { defaultRenders += 1; return html``; }
    }
    class Quiet extends LitElement {
      controller = session.hub(this, "/hub", { reactiveStatus: false });
      render() { quietRenders += 1; return html``; }
    }
    const a = document.createElement(define(Default)) as Default;
    const b = document.createElement(define(Quiet)) as Quiet;
    document.body.append(a, b);
    await Promise.all([a.updateComplete, b.updateComplete]);
    await tick();
    const beforeA = defaultRenders;
    const beforeB = quietRenders;

    connections[0]!.onreconnecting.mock.calls[0]![0]();
    await tick();
    expect(defaultRenders).toBeGreaterThan(beforeA);
    expect(quietRenders).toBe(beforeB);
    session.stop();
  });

  it("does not release another controller's ref when a removed host is disposed or disposed twice", async () => {
    const session = runtime();
    const a = hostOf(session);
    const b = hostOf(session);
    document.body.append(a, b);
    await Promise.all([a.updateComplete, b.updateComplete]);
    await tick();

    a.remove();
    a.controller.dispose();
    a.controller.dispose();
    await tick();
    expect(connections[0]!.stop).not.toHaveBeenCalled();
    session.stop();
  });

  it("runs a shared handler once per controller and keeps it after one unsubscribes", async () => {
    const session = runtime();
    const shared = vi.fn();
    class Host extends LitElement {
      controller = session.hub(this, "/hub");
      stop = this.controller.on("Tick", shared);
    }
    const name = define(Host);
    const a = document.createElement(name) as Host;
    const b = document.createElement(name) as Host;
    document.body.append(a, b);
    await Promise.all([a.updateComplete, b.updateComplete]);
    await tick();
    const listener = connections[0]!.on.mock.calls.find(([name]) => name === "Tick")![1] as (
      value: number,
    ) => void;

    listener(1);
    expect(shared).toHaveBeenCalledTimes(2);
    a.stop();
    listener(2);
    expect(shared).toHaveBeenCalledTimes(3);
    session.stop();
  });

  it("does not start an eager hub when update() runs before any host connects", async () => {
    const client = createSignalRClient({ hubs: { "/eager": {} } });
    const session = client.createSession({
      baseUrl: undefined,
      accessTokenFactory: () => "token",
    });
    session.update({ baseUrl: "https://example.test" });
    await tick();
    expect(connections).toHaveLength(0);
    session.stop();
  });
});
