import "@angular/compiler";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ApplicationRef,
  Component,
  NgZone,
  provideZoneChangeDetection,
  provideZonelessChangeDetection,
  signal,
} from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { event, method } from "@dammers/use-signalr-core";
import { hubStatus$ } from "../rxjs-interop.js";
import { createSignalRClient } from "../create-signalr-client.js";
import type { HubConnectionStatus } from "@dammers/use-signalr-core";
import type { SignalROptions } from "../types.js";

const HUB = "/hubs/chat" as const;
const BASE_URL = "https://example.test";
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

interface FakeConn {
  state: string;
  handlers: Map<string, Array<(...args: unknown[]) => void>>;
  reconnectingHandlers: Array<() => void>;
  reconnectedHandlers: Array<() => void>;
  invoke: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  connect: () => void;
  push: (name: string, ...args: unknown[]) => void;
  startedInAngularZone: boolean;
  reconnecting: () => void;
  reconnected: () => void;
}

let connections: FakeConn[] = [];
let pendingTimers: ReturnType<typeof setTimeout>[] = [];

function makeFakeConn(): FakeConn {
  let resolveStart: () => void = () => {};
  const conn: FakeConn = {
    state: "Disconnected",
    startedInAngularZone: false,
    handlers: new Map(),
    reconnectingHandlers: [],
    reconnectedHandlers: [],
    invoke: vi.fn((_method: string, arg: string) => Promise.resolve(`echo:${arg}`)),
    stop: vi.fn(() => {
      conn.state = "Disconnected";
      return Promise.resolve();
    }),
    connect: () => {
      conn.state = "Connected";
      resolveStart();
    },
    push: (name, ...args) => conn.handlers.get(name)?.forEach((fn) => fn(...args)),
    reconnecting: () => conn.reconnectingHandlers.forEach((fn) => fn()),
    reconnected: () => conn.reconnectedHandlers.forEach((fn) => fn()),
  };
  Object.assign(conn, {
    on: (name: string, fn: (...args: unknown[]) => void) => {
      conn.handlers.set(name, [...(conn.handlers.get(name) ?? []), fn]);
    },
    off: (name: string, fn: (...args: unknown[]) => void) => {
      conn.handlers.set(
        name,
        (conn.handlers.get(name) ?? []).filter((h) => h !== fn),
      );
    },
    start: () => {
      conn.startedInAngularZone = NgZone.isInAngularZone();
      pendingTimers.push(setTimeout(() => {}, 30_000));
      return new Promise<void>((resolve) => (resolveStart = resolve));
    },
    onclose: () => {},
    onreconnecting: (fn: () => void) => conn.reconnectingHandlers.push(fn),
    onreconnected: (fn: () => void) => conn.reconnectedHandlers.push(fn),
  });
  return conn;
}

vi.mock("@microsoft/signalr", () => {
  class HubConnectionBuilder {
    withUrl() {
      return this;
    }
    configureLogging() {
      return this;
    }
    withAutomaticReconnect() {
      return this;
    }
    build() {
      const conn = makeFakeConn();
      connections.push(conn);
      return conn;
    }
  }
  const HubConnectionState = {
    Disconnected: "Disconnected",
    Connecting: "Connecting",
    Connected: "Connected",
    Disconnecting: "Disconnecting",
    Reconnecting: "Reconnecting",
  };
  return { HubConnectionBuilder, HubConnectionState, LogLevel: { Information: 2 } };
});

function makeClient(hubConfig: { lazy?: boolean; graceMs?: number } = {}) {
  return createSignalRClient({
    hubs: {
      [HUB]: {
        ...hubConfig,
        events: { OnFoo: event<[string]>() },
        methods: { Echo: method<[string], string>() },
      },
    },
  });
}

type Client = ReturnType<typeof makeClient>;

function setup(
  client: Client,
  options: Partial<SignalROptions> = {},
  extraProviders: Parameters<typeof TestBed.configureTestingModule>[0] = {},
) {
  TestBed.configureTestingModule({
    ...extraProviders,
    providers: [
      ...(extraProviders.providers ?? []),
      client.provideSignalR({
        baseUrl: BASE_URL,
        accessTokenFactory: () => "token",
        ...options,
      }),
    ],
  });
  return TestBed.inject(ApplicationRef);
}

/** Runs afterNextRender, then the provider effect, then the eager build. */
async function flush(appRef: ApplicationRef) {
  appRef.tick();
  await tick();
  appRef.tick();
  await tick();
}

function component(init: () => void) {
  return Component({ template: "" })(
    class {
      constructor() {
        init();
      }
    },
  );
}

beforeEach(() => {
  connections = [];
});

afterEach(() => {
  pendingTimers.forEach(clearTimeout);
  pendingTimers = [];
  TestBed.resetTestingModule();
});

describe("S1 invoke in the constructor", () => {
  it("resolves after the connect", async () => {
    const client = makeClient();
    let result: Promise<string> | undefined;
    const Cmp = component(() => {
      const echo = client.injectHubInvoke(HUB, "Echo");
      result = echo("x");
    });
    const appRef = setup(client);
    TestBed.createComponent(Cmp);
    await flush(appRef);
    expect(connections[0]!.invoke).not.toHaveBeenCalled();

    connections[0]!.connect();
    await expect(result).resolves.toBe("echo:x");
  });
});

describe("S2 event in the same task as the connect", () => {
  it("delivers the event to the handler", async () => {
    const client = makeClient();
    const handler = vi.fn();
    const Cmp = component(() => client.injectHubEvent(HUB, "OnFoo", handler));
    const appRef = setup(client);
    TestBed.createComponent(Cmp);
    await flush(appRef);

    connections[0]!.connect();
    connections[0]!.push("OnFoo", "hello");
    expect(handler).toHaveBeenCalledWith("hello");
  });
});

describe("S3 event right after an auto-reconnect", () => {
  it("delivers the event to the handler", async () => {
    const client = makeClient();
    const handler = vi.fn();
    const Cmp = component(() => client.injectHubEvent(HUB, "OnFoo", handler));
    const appRef = setup(client);
    TestBed.createComponent(Cmp);
    await flush(appRef);
    connections[0]!.connect();
    await flush(appRef);
    connections[0]!.reconnecting();
    await flush(appRef);

    connections[0]!.reconnected();
    connections[0]!.push("OnFoo", "again");
    expect(handler).toHaveBeenCalledWith("again");
  });
});

describe("S4 a reconnect callback throws", () => {
  it("ends as connected and events still arrive", async () => {
    const errors: unknown[] = [];
    const client = makeClient();
    const handler = vi.fn();
    let status: ReturnType<Client["injectHubStatus"]> | undefined;
    const Cmp = component(() => {
      status = client.injectHubStatus(HUB);
      client.injectOnReconnected(HUB, () => {
        throw new Error("boom");
      });
      client.injectHubEvent(HUB, "OnFoo", handler);
    });
    const appRef = setup(client, { onError: (_hub, err) => errors.push(err) });
    TestBed.createComponent(Cmp);
    await flush(appRef);
    connections[0]!.connect();
    await tick();

    connections[0]!.reconnecting();
    expect(status!()).toBe("reconnecting");
    connections[0]!.reconnected();
    expect(status!()).toBe("connected");
    expect(errors).toHaveLength(1);
    connections[0]!.push("OnFoo", "still");
    expect(handler).toHaveBeenCalledWith("still");
  });
});

describe("provider teardown", () => {
  it("stops the connection once when the injector is destroyed and builds no new one", async () => {
    const client = makeClient();
    const appRef = setup(client);
    await flush(appRef);
    connections[0]!.connect();
    await tick();
    expect(connections[0]!.stop).not.toHaveBeenCalled();

    TestBed.resetTestingModule();
    await tick();
    expect(connections).toHaveLength(1);
    expect(connections[0]!.stop).toHaveBeenCalledTimes(1);
  });
});

describe("S5 unrelated reactive change", () => {
  it("does not rebuild when the derived values stay equal", async () => {
    const client = makeClient();
    const user = signal({ name: "a", admin: true });
    const appRef = setup(client, { enabled: () => user().admin });
    await flush(appRef);
    expect(connections).toHaveLength(1);

    user.set({ name: "b", admin: true });
    await flush(appRef);
    expect(connections).toHaveLength(1);
    expect(connections[0]!.stop).not.toHaveBeenCalled();
  });
});

describe("S6 connectionKey change", () => {
  it("rebuilds once, the rebuild runs the reconnect callback, and the handler stays", async () => {
    const client = makeClient();
    const key = signal("k1");
    const handler = vi.fn();
    const onReconnected = vi.fn();
    const Cmp = component(() => {
      client.injectHubEvent(HUB, "OnFoo", handler);
      client.injectOnReconnected(HUB, onReconnected);
    });
    const appRef = setup(client, { connectionKey: key });
    TestBed.createComponent(Cmp);
    await flush(appRef);
    connections[0]!.connect();
    await tick();

    key.set("k2");
    await flush(appRef);
    expect(connections).toHaveLength(2);
    expect(connections[0]!.stop).toHaveBeenCalled();

    connections[1]!.connect();
    await tick();
    connections[1]!.push("OnFoo", "new");
    expect(handler).toHaveBeenCalledWith("new");
    expect(onReconnected).toHaveBeenCalledTimes(1);
    connections[1]!.reconnected();
    expect(onReconnected).toHaveBeenCalledTimes(2);
  });
});

describe("S7 destroy while an invoke waits", () => {
  it("rejects with AbortError and never reaches the server", async () => {
    const client = makeClient();
    let result: Promise<string> | undefined;
    const Cmp = component(() => {
      const echo = client.injectHubInvoke(HUB, "Echo");
      result = echo("x");
    });
    const appRef = setup(client);
    const fixture = TestBed.createComponent(Cmp);
    await flush(appRef);

    const outcome = result!.catch((err: unknown) => err);
    fixture.destroy();
    const error = await outcome;
    expect(error).toMatchObject({ name: "AbortError" });
    connections[0]!.connect();
    await tick();
    expect(connections[0]!.invoke).not.toHaveBeenCalled();
  });
});

describe("S8 first connect status", () => {
  it("goes through connecting to connected", async () => {
    const client = makeClient();
    const seen: HubConnectionStatus[] = [];
    const appRef = setup(client, { onStatusChange: (_hub, status) => seen.push(status) });
    await flush(appRef);
    connections[0]!.connect();
    await tick();
    expect(seen).toEqual(["connecting", "connected"]);
  });
});

describe("S9 lazy hub", () => {
  it("connects with the first consumer and stops after the grace period", async () => {
    const client = makeClient({ lazy: true, graceMs: 20 });
    const Cmp = component(() => client.injectKeepHubAlive(HUB));
    const appRef = setup(client);
    await flush(appRef);
    expect(connections).toHaveLength(0);

    const fixture = TestBed.createComponent(Cmp);
    await flush(appRef);
    expect(connections).toHaveLength(1);

    fixture.destroy();
    await tick();
    expect(connections[0]!.stop).not.toHaveBeenCalled();
    await tick(40);
    expect(connections[0]!.stop).toHaveBeenCalledTimes(1);
  });
});

describe("zoneless", () => {
  it("delivers an event and a status change with no zone", async () => {
    const client = makeClient();
    const handler = vi.fn();
    let status: ReturnType<Client["injectHubStatus"]> | undefined;
    const Cmp = component(() => {
      status = client.injectHubStatus(HUB);
      client.injectHubEvent(HUB, "OnFoo", handler);
    });
    setup(client, {}, { providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Cmp);
    await fixture.whenStable();
    expect(connections).toHaveLength(1);

    connections[0]!.connect();
    connections[0]!.push("OnFoo", "zoneless");
    await tick();
    expect(handler).toHaveBeenCalledWith("zoneless");
    expect(status!()).toBe("connected");
  });
});

describe("zone policy", () => {
  const zoneProviders = { providers: [provideZoneChangeDetection()] };

  it("starts an eager and a late lazy hub outside NgZone and stays stable while connected", async () => {
    const client = createSignalRClient({
      hubs: {
        "/hubs/eager": { events: {}, methods: {} },
        "/hubs/late": { lazy: true, events: {}, methods: {} },
      },
    });
    const Cmp = component(() => client.injectKeepHubAlive("/hubs/late"));
    const appRef = setup(client as unknown as Client, {}, zoneProviders);
    await flush(appRef);
    expect(connections).toHaveLength(1);
    expect(connections[0]!.startedInAngularZone).toBe(false);

    TestBed.inject(NgZone).run(() => TestBed.createComponent(Cmp));
    await flush(appRef);
    expect(connections).toHaveLength(2);
    expect(connections[1]!.startedInAngularZone).toBe(false);

    connections.forEach((c) => c.connect());
    await tick();
    await expect(appRef.whenStable()).resolves.toBeUndefined();
  });

  it("runs event handlers and reconnect callbacks inside NgZone", async () => {
    const client = makeClient();
    const zones: boolean[] = [];
    const Cmp = component(() => {
      client.injectHubEvent(HUB, "OnFoo", () => zones.push(NgZone.isInAngularZone()));
      client.injectOnReconnected(HUB, () => zones.push(NgZone.isInAngularZone()));
    });
    const appRef = setup(client, {}, zoneProviders);
    TestBed.createComponent(Cmp);
    await flush(appRef);
    connections[0]!.connect();
    await tick();

    connections[0]!.push("OnFoo", "x");
    connections[0]!.reconnected();
    expect(zones.length).toBeGreaterThanOrEqual(2);
    expect(zones.every(Boolean)).toBe(true);
  });

  it("runs onStatusChange and onError inside NgZone", async () => {
    const client = makeClient();
    const zones: boolean[] = [];
    const Cmp = component(() => {
      client.injectOnReconnected(HUB, () => {
        throw new Error("boom");
      });
    });
    const appRef = setup(
      client,
      {
        onStatusChange: () => zones.push(NgZone.isInAngularZone()),
        onError: () => zones.push(NgZone.isInAngularZone()),
      },
      zoneProviders,
    );
    TestBed.createComponent(Cmp);
    await flush(appRef);
    connections[0]!.connect();
    await tick();
    const statusCalls = zones.length;
    expect(statusCalls).toBeGreaterThan(0);

    connections[0]!.reconnected();
    expect(zones.length).toBeGreaterThan(statusCalls);
    expect(zones.every(Boolean)).toBe(true);
  });

  it("holds a lazy hub for a kept invoke after the component is destroyed", async () => {
    const client = makeClient({ lazy: true, graceMs: 0 });
    let result: Promise<string> | undefined;
    const Cmp = component(() => {
      const echo = client.injectHubInvoke(HUB, "Echo", { keepAliveOnUnmount: true });
      result = echo("k");
    });
    const appRef = setup(client, {}, zoneProviders);
    await flush(appRef);
    const fixture = TestBed.createComponent(Cmp);
    await flush(appRef);
    fixture.destroy();
    await tick(20);
    expect(connections[0]!.stop).not.toHaveBeenCalled();

    connections[0]!.connect();
    await expect(result).resolves.toBe("echo:k");
  });
});

describe("hubStatus$", () => {
  it("emits each status change of the hub", async () => {
    const client = makeClient();
    const seen: HubConnectionStatus[] = [];
    const Cmp = component(() => {
      hubStatus$(client.injectHubStatus(HUB)).subscribe((status) => seen.push(status));
    });
    const appRef = setup(client);
    // toObservable runs a view effect, which Angular 20 flushes only when the view is checked.
    const fixture = TestBed.createComponent(Cmp);
    await flush(appRef);
    fixture.detectChanges();
    connections[0]!.connect();
    await flush(appRef);
    fixture.detectChanges();
    expect(seen).toContain("connecting");
    expect(seen.at(-1)).toBe("connected");
  });
});
