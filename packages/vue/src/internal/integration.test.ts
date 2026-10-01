import { createApp, defineComponent, effectScope, h, nextTick, ref } from "vue";
import type { Ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { event, method } from "@dammers/use-signalr-core";
import type { HubConnectionStatus } from "@dammers/use-signalr-core";
import { createSignalRClient } from "../create-signalr-client.js";
import type { SignalROptions } from "../types.js";

const HUB = "/hubs/chat" as const;

function fakeConnection() {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  let resolveStart: () => void = () => {};
  let reconnectingCb: (() => void) | undefined;
  let reconnectedCb: (() => void) | undefined;
  const conn = {
    state: "Disconnected",
    start: vi.fn(() => new Promise<void>((resolve) => { resolveStart = resolve; })),
    stop: vi.fn(() => { conn.state = "Disconnected"; return Promise.resolve(); }),
    invoke: vi.fn(() => Promise.resolve("pong")),
    on: vi.fn((name: string, cb: (...args: unknown[]) => void) => {
      listeners.set(name, [...(listeners.get(name) ?? []), cb]);
    }),
    off: vi.fn(),
    onclose: vi.fn(),
    onreconnecting: vi.fn((cb: () => void) => { reconnectingCb = cb; }),
    onreconnected: vi.fn((cb: () => void) => { reconnectedCb = cb; }),
    connect() { conn.state = "Connected"; resolveStart(); },
    push(name: string, ...args: unknown[]) { listeners.get(name)?.forEach((cb) => cb(...args)); },
    reconnect() { reconnectingCb?.(); conn.state = "Connected"; reconnectedCb?.(); },
  };
  return conn;
}

let connections: Array<ReturnType<typeof fakeConnection>> = [];

vi.mock("@microsoft/signalr", () => ({
  HubConnectionBuilder: class {
    withUrl() { return this; }
    configureLogging() { return this; }
    withAutomaticReconnect() { return this; }
    build() {
      const conn = fakeConnection();
      connections.push(conn);
      return conn;
    }
  },
  HubConnectionState: { Disconnected: "Disconnected", Connecting: "Connecting", Connected: "Connected", Disconnecting: "Disconnecting", Reconnecting: "Reconnecting" },
  LogLevel: { Information: 2 },
}));

beforeEach(() => { connections = []; });

const makeClient = (lazy = false, graceMs = 0) =>
  createSignalRClient({
    hubs: {
      [HUB]: {
        lazy,
        graceMs,
        events: { OnFoo: event<[value: string]>() },
        methods: { Ping: method<[], string>() },
      },
    },
  });
type Client = ReturnType<typeof makeClient>;

function mountApp(
  client: Client,
  setup: () => void,
  options: Partial<SignalROptions> = {},
) {
  const app = createApp(defineComponent({ setup() { setup(); return () => null; } }));
  app.use(client, { baseUrl: "https://example.test", accessTokenFactory: () => "token", ...options });
  app.mount(document.createElement("div"));
  return app;
}

describe("Vue adapter with the real session", () => {
  it("S1: an invoke in setup resolves after the connect", async () => {
    const client = makeClient();
    let result: Promise<string> | undefined;
    const app = mountApp(client, () => {
      result = client.useSignalRInvoke(HUB, "Ping")();
    });
    await nextTick();
    expect(connections[0]?.invoke).not.toHaveBeenCalled();
    connections[0]?.connect();
    await expect(result).resolves.toBe("pong");
    app.unmount();
  });

  it("S2: delivers an event pushed in the same task as the connect", () => {
    const client = makeClient();
    const handler = vi.fn();
    const app = mountApp(client, () => client.useSignalREvent(HUB, "OnFoo", handler));
    connections[0]?.connect();
    connections[0]?.push("OnFoo", "first");
    expect(handler).toHaveBeenCalledWith("first");
    app.unmount();
  });

  it("removes the event handler when its scope stops", () => {
    const client = makeClient();
    const app = createApp({ render: () => null });
    app.use(client, { baseUrl: "https://example.test", accessTokenFactory: () => "token" });
    app.mount(document.createElement("div"));
    const gone = vi.fn();
    const live = vi.fn();
    const scope = effectScope();
    scope.run(() => app.runWithContext(() => client.useSignalREvent(HUB, "OnFoo", gone)));
    app.runWithContext(() => effectScope().run(() => client.useSignalREvent(HUB, "OnFoo", live)));
    connections[0]?.connect();
    scope.stop();
    connections[0]?.push("OnFoo", "late");
    expect(gone).not.toHaveBeenCalled();
    expect(live).toHaveBeenCalledWith("late");
    app.unmount();
  });

  it("keeps a shared reconnect callback for the other consumer when one scope stops", () => {
    const client = makeClient();
    const app = createApp({ render: () => null });
    app.use(client, { baseUrl: "https://example.test", accessTokenFactory: () => "token" });
    app.mount(document.createElement("div"));
    const shared = vi.fn();
    const first = effectScope();
    first.run(() => app.runWithContext(() => client.useOnReconnected(HUB, shared)));
    app.runWithContext(() => effectScope().run(() => client.useOnReconnected(HUB, shared)));
    connections[0]?.connect();
    first.stop();
    connections[0]?.reconnect();
    expect(shared).toHaveBeenCalledTimes(1);
    app.unmount();
  });

  it("S3: delivers an event pushed right after an auto-reconnect", async () => {
    const client = makeClient();
    const handler = vi.fn();
    const app = mountApp(client, () => client.useSignalREvent(HUB, "OnFoo", handler));
    connections[0]?.connect();
    await nextTick();
    connections[0]?.reconnect();
    connections[0]?.push("OnFoo", "after");
    expect(handler).toHaveBeenCalledWith("after");
    app.unmount();
  });

  it("S4: a throwing reconnect callback keeps the status connected and events flowing", async () => {
    const client = makeClient();
    const handler = vi.fn();
    const onError = vi.fn();
    let status: Readonly<Ref<HubConnectionStatus>> | undefined;
    const app = mountApp(
      client,
      () => {
        status = client.useHubStatus(HUB);
        client.useSignalREvent(HUB, "OnFoo", handler);
        client.useOnReconnected(HUB, () => { throw new Error("boom"); });
      },
      { onError },
    );
    connections[0]?.connect();
    await nextTick();
    connections[0]?.reconnect();
    connections[0]?.push("OnFoo", "still");
    expect(status?.value).toBe("connected");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("still");
    app.unmount();
  });

  it("S5: an unrelated reactive value does not rebuild", async () => {
    const client = makeClient();
    const token = ref("a");
    const unrelated = ref(0);
    const app = mountApp(client, () => {}, {
      baseUrl: () => (unrelated.value >= 0 ? "https://example.test" : undefined),
      enabled: () => token.value.length > 0,
      accessTokenFactory: () => token.value,
    });
    token.value = "b";
    unrelated.value += 1;
    await nextTick();
    expect(connections).toHaveLength(1);
    expect(connections[0]?.stop).not.toHaveBeenCalled();
    app.unmount();
  });

  it("S6: a connectionKey change rebuilds once, the rebuild runs the reconnect callback, and the handler stays", async () => {
    const client = makeClient();
    const key = ref(1);
    const handler = vi.fn();
    const onReconnected = vi.fn();
    const app = mountApp(
      client,
      () => {
        client.useSignalREvent(HUB, "OnFoo", handler);
        client.useOnReconnected(HUB, onReconnected);
      },
      { connectionKey: key },
    );
    connections[0]?.connect();
    await nextTick();
    key.value = 2;
    await nextTick();
    expect(connections).toHaveLength(2);
    connections[1]?.connect();
    await nextTick();
    connections[1]?.push("OnFoo", "new");
    expect(handler).toHaveBeenCalledWith("new");
    expect(onReconnected).toHaveBeenCalledTimes(1);
    connections[1]?.reconnect();
    expect(onReconnected).toHaveBeenCalledTimes(2);
    app.unmount();
  });

  it("S7: unmount during a waiting invoke rejects with AbortError and sends nothing", async () => {
    const client = makeClient();
    let outcome: Promise<unknown> | undefined;
    const app = mountApp(client, () => {
      outcome = client.useSignalRInvoke(HUB, "Ping")().catch((error: unknown) => error);
    });
    await nextTick();
    app.unmount();
    const error = await outcome;
    expect(error).toMatchObject({ name: "AbortError" });
    expect(connections[0]?.invoke).not.toHaveBeenCalled();
  });

  it("S7: unmounting only the consumer aborts a waiting invoke and sends nothing", async () => {
    const client = makeClient();
    const showConsumer = ref(true);
    let outcome: Promise<unknown> | undefined;
    const Consumer = defineComponent({
      setup() {
        outcome = client.useSignalRInvoke(HUB, "Ping")().catch((error: unknown) => error);
        return () => null;
      },
    });
    const app = createApp({ render: () => (showConsumer.value ? h(Consumer) : null) });
    app.use(client, { baseUrl: "https://example.test", accessTokenFactory: () => "token" });
    app.mount(document.createElement("div"));
    await nextTick();

    showConsumer.value = false;
    await nextTick();
    connections[0]?.connect();
    await nextTick();

    expect(await outcome).toMatchObject({ name: "AbortError" });
    expect(connections[0]?.invoke).not.toHaveBeenCalled();
    app.unmount();
  });

  it("S8: the first connect goes through connecting to connected", async () => {
    const client = makeClient();
    const statuses: HubConnectionStatus[] = [];
    const app = mountApp(client, () => {}, {
      onStatusChange: (_hub, status) => statuses.push(status),
    });
    connections[0]?.connect();
    await nextTick();
    expect(statuses).toEqual(["connecting", "connected"]);
    app.unmount();
  });

  it("S9: a lazy hub connects with the first consumer and stops after the grace period", async () => {
    const client = makeClient(true, 10);
    const app = createApp({ render: () => null });
    app.use(client, { baseUrl: "https://example.test", accessTokenFactory: () => "token" });
    app.mount(document.createElement("div"));
    expect(connections).toHaveLength(0);

    const scope = effectScope();
    scope.run(() => app.runWithContext(() => client.useHubConsumer(HUB)));
    expect(connections).toHaveLength(1);

    scope.stop();
    expect(connections[0]?.stop).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(connections[0]?.stop).toHaveBeenCalledTimes(1);
    app.unmount();
  });
});
