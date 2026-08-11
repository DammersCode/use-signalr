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

  it("cleans the session through the Vue 3.3 unmount fallback", async () => {
    const client = createSignalRClient({ hubs: { [HUB]: {} } });
    const app = createApp({ render: () => null });
    Reflect.set(app, "onUnmount", undefined);
    app.use(client, {
      baseUrl: "https://example.test",
      accessTokenFactory: () => "token",
    });
    app.mount(document.createElement("div"));

    app.unmount();

    expect(connection.stop).toHaveBeenCalled();
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

  it("cleans an event listener and reattaches it once after reconnect", async () => {
    let status: Readonly<Ref<HubConnectionStatus>> | undefined;
    const onReconnected = vi.fn();
    const { app } = mount((client) => {
      status = client.useHubStatus(HUB);
      client.useSignalREvent(HUB, "OnFoo", () => {});
      client.useOnReconnected(HUB, onReconnected);
    });
    await nextTick(); await connect(); await nextTick();
    expect(status?.value).toBe("connected");
    expect(connection.on).toHaveBeenCalledTimes(1);
    reconnecting?.();
    expect(status?.value).toBe("reconnecting");
    await nextTick();
    reconnected?.();
    await nextTick();
    expect(status?.value).toBe("connected");
    expect(onReconnected).toHaveBeenCalledTimes(1);
    expect(connection.off).toHaveBeenCalledTimes(1);
    expect(connection.on).toHaveBeenCalledTimes(2);
    app.unmount();
    expect(connection.off).toHaveBeenCalledTimes(2);
  });
});
