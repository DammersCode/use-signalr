import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/svelte";
import { resolveHubConfig } from "@dammers/use-signalr-core";
import { createSignalRProvider } from "./create-provider";
import { createSignalRHooks } from "./create-hooks";
import { createStatusStore } from "../status-store";
import { makeHarness } from "./test-harness";
import Runner from "./test-components/Runner.svelte";
import Provider from "./test-components/Provider.svelte";
import type { SignalRProviderProps } from "../types";

const HUB = "/hubs/chat" as const;
const tick = () => new Promise((r) => setTimeout(r, 0));

// --- Fake @microsoft/signalr, mirroring packages/core/src/connection-manager.test.ts ---
type OnCall = { name: string; fn: (...args: unknown[]) => void };
let onCalls: OnCall[] = [];
let startResolvers: Array<() => void> = [];
let onCloseHandler: ((err?: unknown) => void) | undefined;
let onReconnectingHandler: (() => void) | undefined;
let onReconnectedHandler: (() => void) | undefined;
let fakeConnection: ReturnType<typeof makeFakeConnection>;

function makeFakeConnection() {
  const conn = {
    on: vi.fn((name: string, fn: (...args: unknown[]) => void) => {
      onCalls.push({ name, fn });
    }),
    off: vi.fn(),
    start: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          startResolvers.push(resolve);
        }),
    ),
    stop: vi.fn(() => {
      conn.state = "Disconnected";
      onCloseHandler?.(undefined);
      return Promise.resolve();
    }),
    onclose: vi.fn((fn: (err?: unknown) => void) => {
      onCloseHandler = fn;
    }),
    onreconnecting: vi.fn((fn: () => void) => {
      onReconnectingHandler = fn;
    }),
    onreconnected: vi.fn((fn: () => void) => {
      onReconnectedHandler = fn;
    }),
    state: "Disconnected",
  };
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
      return fakeConnection;
    }
  }
  const HubConnectionState = {
    Disconnected: "Disconnected",
    Connecting: "Connecting",
    Connected: "Connected",
    Disconnecting: "Disconnecting",
    Reconnecting: "Reconnecting",
  };
  const LogLevel = { Information: 2 };
  return { HubConnectionBuilder, HubConnectionState, LogLevel };
});

async function resolveStart() {
  fakeConnection.state = "Connected";
  const resolvers = startResolvers.splice(0);
  resolvers.forEach((r) => r());
  await tick();
  await tick();
}

beforeEach(() => {
  onCalls = [];
  startResolvers = [];
  onCloseHandler = undefined;
  onReconnectingHandler = undefined;
  onReconnectedHandler = undefined;
  fakeConnection = makeFakeConnection();
});

// 1 & 2: refcounting via the harness's acquire/release counters.
describe("lazy hub refcounting (harness)", () => {
  it("destroying one of two consumers does not release to zero", () => {
    const h = makeHarness();
    const view1 = render(Runner, {
      props: { run: () => h.hooks.keepHubAlive(HUB) },
      context: h.context,
    });
    const view2 = render(Runner, {
      props: { run: () => h.hooks.keepHubAlive(HUB) },
      context: h.context,
    });

    expect(h.acquireCount).toBe(2);
    view1.unmount();
    expect(h.releaseCount).toBe(1);
    expect(h.acquireCount).toBeGreaterThan(h.releaseCount);

    view2.unmount();
  });

  it("destroying the last consumer releases fully (counts balance)", () => {
    const h = makeHarness();
    const view1 = render(Runner, {
      props: { run: () => h.hooks.keepHubAlive(HUB) },
      context: h.context,
    });
    const view2 = render(Runner, {
      props: { run: () => h.hooks.keepHubAlive(HUB) },
      context: h.context,
    });

    view1.unmount();
    view2.unmount();

    expect(h.acquireCount).toBe(2);
    expect(h.releaseCount).toBe(2);
  });
});

// 3: lazy hub with the real provider + mocked signalr.
describe("lazy hub (real provider, mocked signalr)", () => {
  function makeClient(lazy: boolean) {
    const contextKey = Symbol("use-signalr-lifecycle-test");
    const resolved = resolveHubConfig(
      { hubs: { [HUB]: { lazy, graceMs: 0 } } } as any,
      { lazy, graceMs: 0 } as any,
    );
    const provideSignalR = createSignalRProvider<any>(contextKey, [HUB], () => resolved);
    const hooks = createSignalRHooks<any>(contextKey);
    return { provideSignalR, hooks };
  }

  it("no connection built at init without consumers", async () => {
    const { provideSignalR } = makeClient(true);
    const providerProps: SignalRProviderProps = {
      baseUrl: "https://example.test",
      accessTokenFactory: () => "token",
    };
    const view = render(Provider, { props: { provide: provideSignalR, providerProps } });
    await tick();
    expect(fakeConnection.start).not.toHaveBeenCalled();
    view.unmount();
  });

  it("first consumer init triggers buildAndStart; destroy stops (graceMs 0)", async () => {
    const { provideSignalR, hooks } = makeClient(true);
    const providerProps: SignalRProviderProps = {
      baseUrl: "https://example.test",
      accessTokenFactory: () => "token",
    };

    const view = render(Provider, {
      props: {
        provide: provideSignalR,
        providerProps,
        run: () => hooks.keepHubAlive(HUB),
      },
    });
    await tick();
    expect(fakeConnection.start).toHaveBeenCalledTimes(1);

    view.unmount();
    // graceMs 0 schedules the stop via queueMicrotask. Destroying the whole
    // tree at once tears down both the consumer's refcount release AND the
    // provider's own manager disposal, so stop() may be invoked from either
    // path (or both) on the same underlying connection — either way, the
    // hub must end up stopped.
    await tick();
    await tick();
    expect(fakeConnection.stop).toHaveBeenCalled();
  });
});

// 4: onHubEvent re-attaches exactly once across a reconnect cycle.
describe("onHubEvent re-attach across reconnect", () => {
  it("registers exactly one handler after a reconnect cycle", async () => {
    const contextKey = Symbol("use-signalr-reconnect-test");
    const resolved = resolveHubConfig({ hubs: { [HUB]: {} } } as any, {} as any);
    const provideSignalR = createSignalRProvider<any>(contextKey, [HUB], () => resolved);
    const hooks = createSignalRHooks<any>(contextKey);

    let handlerCalls = 0;
    const providerProps: SignalRProviderProps = {
      baseUrl: "https://example.test",
      accessTokenFactory: () => "token",
    };

    const view = render(Provider, {
      props: {
        provide: provideSignalR,
        providerProps,
        run: () =>
          hooks.onHubEvent(HUB, "OnFoo", () => {
            handlerCalls += 1;
          }),
      },
    });
    await tick();
    await resolveStart(); // connected

    const onCountAfterConnect = onCalls.filter((c) => c.name === "OnFoo").length;
    expect(onCountAfterConnect).toBe(1);

    // Simulate a reconnect cycle: reconnecting -> reconnected.
    onReconnectingHandler?.();
    await tick();
    onReconnectedHandler?.();
    await tick();

    const onCountAfterReconnect = onCalls.filter((c) => c.name === "OnFoo").length;
    const offCount = fakeConnection.off.mock.calls.filter((c) => c[0] === "OnFoo").length;

    // Exactly one detach/attach pair across the reconnect cycle.
    expect(onCountAfterReconnect - onCountAfterConnect).toBe(1);
    expect(offCount).toBe(1);

    void handlerCalls;
    view.unmount();
  });
});

// 5: per-hub isolation — a status change on hub B must not notify a
// subscriber that only reads hub A's store.
describe("hubStatus isolation across hubs", () => {
  it("a status change on hub B does not notify a subscriber of hub A", () => {
    const store = createStatusStore<"/hubs/a" | "/hubs/b">();
    let runs = 0;
    const unsubscribe = store.readable("/hubs/a").subscribe(() => {
      runs += 1;
    });

    expect(runs).toBe(1); // subscribe fires immediately with the current value

    store.set("/hubs/b", "connected");
    expect(runs).toBe(1); // unrelated hub: no notification

    store.set("/hubs/a", "connected");
    expect(runs).toBe(2); // tracked hub: notifies

    unsubscribe();
  });
});

// 6: hubStatus starts "disconnected" and updates through the store after
// connect(). Uses the REAL provider (not the harness) since the harness's
// statusStore is a plain stub, not a reactive store.
describe("hubStatus store", () => {
  it("emits 'disconnected' initially and updates after connect()", async () => {
    const contextKey = Symbol("use-signalr-status-test");
    const resolved = resolveHubConfig({ hubs: { [HUB]: {} } } as any, {} as any);
    const provideSignalR = createSignalRProvider<any>(contextKey, [HUB], () => resolved);
    const hooks = createSignalRHooks<any>(contextKey);

    const readings: string[] = [];
    const providerProps: SignalRProviderProps = {
      baseUrl: "https://example.test",
      accessTokenFactory: () => "token",
    };

    const view = render(Provider, {
      props: {
        provide: provideSignalR,
        providerProps,
        run: () => {
          const status = hooks.hubStatus(HUB);
          status.subscribe((s) => readings.push(s));
        },
      },
    });

    expect(readings[0]).toBe("disconnected");

    await resolveStart(); // connected

    expect(readings[readings.length - 1]).toBe("connected");

    view.unmount();
  });
});
