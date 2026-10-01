import {
  createApp,
  defineComponent,
  effectScope,
  h,
  nextTick,
  ref,
  watchEffect,
} from "vue";
import type { Ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HubConnectionStatus } from "@dammers/use-signalr-core";
import { createSignalRClient } from "../create-signalr-client.js";
import { createStatusStore } from "../status-store.js";

const HUB = "/hubs/chat" as const;
let connection: ReturnType<typeof fakeConnection>;
let startResolvers: Array<() => void> = [];
let reconnecting: (() => void) | undefined;
let reconnected: (() => void) | undefined;
let buildCalls = 0;
let currentTokenFactory: (() => string | Promise<string>) | undefined;

function fakeConnection() {
  return {
    state: "Disconnected",
    start: vi.fn(() => new Promise<void>((resolve) => startResolvers.push(resolve))),
    stop: vi.fn(() => {
      connection.state = "Disconnected";
      return Promise.resolve();
    }),
    on: vi.fn(),
    off: vi.fn(),
    onclose: vi.fn(),
    onreconnecting: vi.fn((callback: () => void) => { reconnecting = callback; }),
    onreconnected: vi.fn((callback: () => void) => { reconnected = callback; }),
  };
}

vi.mock("@microsoft/signalr", () => ({
  HubConnectionBuilder: class {
    withUrl(_url: string, options: { accessTokenFactory: () => string | Promise<string> }) {
      currentTokenFactory = options.accessTokenFactory;
      return this;
    }
    configureLogging() { return this; }
    withAutomaticReconnect() { return this; }
    build() {
      buildCalls += 1;
      return connection;
    }
  },
  HubConnectionState: { Disconnected: "Disconnected", Connecting: "Connecting", Connected: "Connected", Disconnecting: "Disconnecting", Reconnecting: "Reconnecting" },
  LogLevel: { Information: 2 },
}));

beforeEach(() => {
  connection = fakeConnection();
  startResolvers = [];
  reconnecting = undefined;
  reconnected = undefined;
  buildCalls = 0;
  currentTokenFactory = undefined;
});

async function connect() {
  connection.state = "Connected";
  startResolvers.splice(0).forEach((resolve) => resolve());
  await nextTick();
}

function mount(run: (client: ReturnType<typeof createSignalRClient>) => void, graceMs = 0) {
  const client = createSignalRClient({ hubs: { [HUB]: { lazy: true, graceMs } } });
  const app = createApp(defineComponent({ setup() { run(client); return () => null; } }));
  app.use(client, { baseUrl: "https://example.test", accessTokenFactory: () => "token" });
  const host = document.createElement("div"); app.mount(host);
  return { app, client };
}

describe("Vue plugin lifecycle", () => {
  it("shares one lazy connection between two components", async () => {
    const client = createSignalRClient({ hubs: { [HUB]: { lazy: true } } });
    const Consumer = defineComponent({
      setup() {
        client.useHubConsumer(HUB);
        return () => null;
      },
    });
    const app = createApp(defineComponent({
      setup() {
        return () => [h(Consumer), h(Consumer)];
      },
    }));
    app.use(client, {
      baseUrl: "https://example.test",
      accessTokenFactory: () => "token",
    });
    app.mount(document.createElement("div"));
    await nextTick();

    expect(buildCalls).toBe(1);
    expect(connection.start).toHaveBeenCalledTimes(1);

    app.unmount();
    await Promise.resolve();
    expect(connection.stop).toHaveBeenCalled();
  });

  it("stops a lazy connection after the final consumer grace period", async () => {
    const { app, client } = mount(() => {} , 15);
    const one = effectScope(); const two = effectScope();
    one.run(() => app.runWithContext(() => client.useHubConsumer(HUB)));
    two.run(() => app.runWithContext(() => client.useHubConsumer(HUB)));
    await nextTick();
    expect(connection.start).toHaveBeenCalledTimes(1);
    one.stop(); await new Promise((resolve) => setTimeout(resolve, 20));
    expect(connection.stop).not.toHaveBeenCalled();
    two.stop(); await new Promise((resolve) => setTimeout(resolve, 20));
    expect(connection.stop).toHaveBeenCalledTimes(1);
    app.unmount();
  });

  it("reads a rotated token without rebuilding and rebuilds for base URL changes", async () => {
    const token = ref("first");
    const baseUrl = ref<string | undefined>("https://one.test");
    const client = createSignalRClient({ hubs: { [HUB]: {} } });
    const app = createApp({ render: () => null });
    app.use(client, {
      baseUrl,
      accessTokenFactory: () => token.value,
    });
    app.mount(document.createElement("div"));

    expect(buildCalls).toBe(1);
    await expect(Promise.resolve(currentTokenFactory?.())).resolves.toBe("first");

    token.value = "second";
    await nextTick();
    expect(buildCalls).toBe(1);
    await expect(Promise.resolve(currentTokenFactory?.())).resolves.toBe("second");

    baseUrl.value = "https://two.test";
    await nextTick();
    expect(buildCalls).toBe(2);
    expect(connection.start).toHaveBeenCalledTimes(2);
    app.unmount();
  });

  it("stops to idle when enabled turns false and rebuilds when it turns true", async () => {
    const enabled = ref(true);
    const client = createSignalRClient({ hubs: { [HUB]: {} } });
    let status: Ref<HubConnectionStatus> | undefined;
    const app = createApp(
      defineComponent({
        setup() {
          status = client.useHubStatus(HUB);
          return () => null;
        },
      }),
    );
    app.use(client, { baseUrl: "https://example.test", enabled, accessTokenFactory: () => "token" });
    app.mount(document.createElement("div"));
    await connect();
    expect(status?.value).toBe("connected");

    enabled.value = false;
    await nextTick();
    expect(connection.stop).toHaveBeenCalledTimes(1);
    expect(status?.value).toBe("idle");

    enabled.value = true;
    await nextTick();
    expect(buildCalls).toBe(2);
    expect(status?.value).toBe("connecting");
    app.unmount();
  });

  it("does not rebuild when an enabled getter reads a rotating token", async () => {
    const token = ref("a");
    const client = createSignalRClient({ hubs: { [HUB]: {} } });
    const app = createApp({ render: () => null });
    app.use(client, {
      baseUrl: "https://example.test",
      enabled: () => Boolean(token.value),
      accessTokenFactory: () => token.value,
    });
    app.mount(document.createElement("div"));
    expect(buildCalls).toBe(1);

    token.value = "b"; await nextTick();
    token.value = "c"; await nextTick();

    expect(buildCalls).toBe(1);
    expect(connection.stop).not.toHaveBeenCalled();
    app.unmount();
  });

  it("throws outside a scope and leaves the ref count unchanged", async () => {
    const { app, client } = mount(() => {});
    expect(() => app.runWithContext(() => client.useHubConsumer(HUB))).toThrow(
      "useHubConsumer must be called inside setup() or an effectScope",
    );
    expect(() => app.runWithContext(() => client.useSignalREvent(HUB, "OnFoo", () => {}))).toThrow(
      "useSignalREvent must be called inside setup() or an effectScope",
    );
    await nextTick();
    expect(buildCalls).toBe(0);
    app.unmount();
  });

  it("does not start when mount finds no container", () => {
    const client = createSignalRClient({ hubs: { [HUB]: {} } });
    const app = createApp({ render: () => null });
    app.use(client, { baseUrl: "https://example.test", accessTokenFactory: () => "token" });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    app.mount("#does-not-exist");
    expect(buildCalls).toBe(0);
    vi.restoreAllMocks();
  });

  it("names the missing scope without an inject warning", () => {
    const { app, client } = mount(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => client.useHubStatus(HUB)).toThrow(
      "useHubStatus must be called inside setup() or an effectScope",
    );
    expect(warn).not.toHaveBeenCalled();
    app.unmount();
  });

  it("names the missing injection context inside a scope", () => {
    const { app, client } = mount(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const scope = effectScope();
    expect(() => scope.run(() => client.useHubStatus(HUB))).toThrow(
      "useHubStatus must be called inside setup() or app.runWithContext()",
    );
    expect(warn).not.toHaveBeenCalled();
    scope.stop();
    app.unmount();
  });

  it("cleans the session through the Vue 3.3 unmount fallback", async () => {
    const client = createSignalRClient({ hubs: { [HUB]: {} } });
    const app = createApp({ render: () => null });
    Reflect.deleteProperty(app, "onUnmount");
    app.use(client, {
      baseUrl: "https://example.test",
      accessTokenFactory: () => "token",
    });
    app.mount(document.createElement("div"));

    app.unmount();

    expect(connection.stop).toHaveBeenCalled();
  });

  // app.onUnmount exists from Vue 3.5; the floor job runs Vue 3.3, which uses the unmount fallback.
  it.skipIf(typeof createApp({}).onUnmount !== "function")("stops an eager connection once through app.onUnmount and does not rebuild", async () => {
    const client = createSignalRClient({ hubs: { [HUB]: {} } });
    const app = createApp({ render: () => null });
    expect(typeof app.onUnmount).toBe("function");
    app.use(client, {
      baseUrl: "https://example.test",
      accessTokenFactory: () => "token",
    });
    app.mount(document.createElement("div"));
    await connect();

    app.unmount();
    await nextTick();

    expect(connection.stop).toHaveBeenCalledTimes(1);
    expect(buildCalls).toBe(1);
  });

  it("throws a clear error when a composable runs without app.use", () => {
    const client = createSignalRClient({ hubs: { [HUB]: {} } });
    const app = createApp({ render: () => null });
    const scope = effectScope();
    expect(() => scope.run(() => app.runWithContext(() => client.useHubStatus(HUB)))).toThrow(
      "useSignalR must be used after app.use(signalR, options)",
    );
    scope.stop();
  });

  it("isolates status refs by hub", async () => {
    const store = createStatusStore<"/a" | "/b">();
    let runs = 0;
    const scope = effectScope();
    scope.run(() => watchEffect(() => { store.ref("/a").value; runs += 1; }));
    await nextTick(); store.set("/b", "connected"); await nextTick();
    expect(runs).toBe(1);
    store.set("/a", "connected"); await nextTick();
    expect(runs).toBe(2); scope.stop();
  });

  it("keeps reconnect callbacks and binds no listener per composable", async () => {
    let status: Readonly<Ref<HubConnectionStatus>> | undefined;
    const onReconnected = vi.fn();
    const handler = vi.fn();
    const scope = effectScope();
    const { app, client } = mount(() => {});
    scope.run(() => app.runWithContext(() => {
      status = client.useHubStatus(HUB);
      client.useSignalREvent(HUB, "OnFoo", handler);
      client.useOnReconnected(HUB, onReconnected);
    }));
    await nextTick(); await connect(); await nextTick();
    expect(status?.value).toBe("connected");
    reconnecting?.();
    expect(status?.value).toBe("reconnecting");
    reconnected?.();
    await nextTick();
    expect(status?.value).toBe("connected");
    expect(onReconnected).toHaveBeenCalledTimes(1);
    expect(connection.on).not.toHaveBeenCalled();
    scope.stop();
    app.unmount();
  });

  it("balances lazy connections across 50 mount cycles", async () => {
    const CYCLES = 50;
    for (let i = 0; i < CYCLES; i += 1) {
      const { app } = mount((client) => {
        client.useSignalREvent(HUB, "OnFoo", () => {});
      });
      await nextTick();
      await connect();
      app.unmount();
      await nextTick();
    }

    expect(buildCalls).toBe(CYCLES);
  });
});
