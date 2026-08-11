import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ApplicationRef,
  EnvironmentInjector,
  InjectionToken,
  createEnvironmentInjector,
  effect,
  runInInjectionContext,
} from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { resolveHubConfig } from "@dammers/use-signalr-core";
import { createSignalRProvider } from "./create-provider";
import { createSignalRHooks } from "./create-hooks";
import { createStatusStore } from "../status-store";
import { makeHarness } from "./test-harness";
import type { SignalRContextValue, SignalROptions } from "../types";

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

/** Flushes afterNextRender + the effect's first tracked run. Two ticks are
 *  required: the first runs afterNextRender (which registers the effect),
 *  the second runs the newly-registered effect's first pass. */
async function flush(appRef: ApplicationRef) {
  appRef.tick();
  await tick();
  appRef.tick();
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

// 1 & 2: refcounting via the harness's acquire/release counters, and via the
// real provider + two independent consumer scopes sharing one connection.
describe("lazy hub refcounting", () => {
  it("harness: acquire then destroy balances the counters", () => {
    const h = makeHarness();
    h.run(() => h.hooks.injectKeepHubAlive(HUB));
    expect(h.acquireCount).toBe(1);
    expect(h.releaseCount).toBe(0);
    h.destroy();
    expect(h.releaseCount).toBe(1);
  });

  it("two consumers on one client: destroying one keeps the hub connected (real provider)", async () => {
    const contextToken = new InjectionToken<SignalRContextValue<any>>("use-signalr-refcount-test");
    const resolved = resolveHubConfig({ hubs: { [HUB]: { lazy: true, graceMs: 0 } } } as any, {
      lazy: true,
      graceMs: 0,
    } as any);
    const provideSignalR = createSignalRProvider<any>(contextToken, [HUB], () => resolved);
    const hooks = createSignalRHooks<any>(contextToken);

    const providerOptions: SignalROptions = {
      baseUrl: "https://example.test",
      accessTokenFactory: () => "token",
    };

    const parent = TestBed.inject(EnvironmentInjector);
    const providerInjector = createEnvironmentInjector([provideSignalR(providerOptions)], parent);

    const consumer1 = createEnvironmentInjector([], providerInjector);
    const consumer2 = createEnvironmentInjector([], providerInjector);
    runInInjectionContext(consumer1, () => hooks.injectKeepHubAlive(HUB));
    runInInjectionContext(consumer2, () => hooks.injectKeepHubAlive(HUB));
    // Also force the provider's context to be resolved so afterNextRender fires.
    runInInjectionContext(providerInjector, () => hooks.injectSignalR());

    const appRef = TestBed.inject(ApplicationRef);
    await flush(appRef);
    expect(fakeConnection.start).toHaveBeenCalledTimes(1);

    consumer1.destroy();
    await tick();
    // Still one consumer left: must not have stopped.
    expect(fakeConnection.stop).not.toHaveBeenCalled();

    consumer2.destroy();
    await tick();
    await tick();
    expect(fakeConnection.stop).toHaveBeenCalled();

    providerInjector.destroy();
  });
});

// 3: lazy hub with the real provider + mocked signalr.
describe("lazy hub (real provider, mocked signalr)", () => {
  function makeClient(lazy: boolean) {
    const contextToken = new InjectionToken<SignalRContextValue<any>>("use-signalr-lifecycle-test");
    const resolved = resolveHubConfig(
      { hubs: { [HUB]: { lazy, graceMs: 0 } } } as any,
      { lazy, graceMs: 0 } as any,
    );
    const provideSignalR = createSignalRProvider<any>(contextToken, [HUB], () => resolved);
    const hooks = createSignalRHooks<any>(contextToken);
    return { provideSignalR, hooks, contextToken };
  }

  it("no connection built at init without consumers", async () => {
    const { provideSignalR, hooks } = makeClient(true);
    const providerOptions: SignalROptions = {
      baseUrl: "https://example.test",
      accessTokenFactory: () => "token",
    };

    const parent = TestBed.inject(EnvironmentInjector);
    const providerInjector = createEnvironmentInjector([provideSignalR(providerOptions)], parent);
    runInInjectionContext(providerInjector, () => hooks.injectSignalR());

    const appRef = TestBed.inject(ApplicationRef);
    await flush(appRef);
    expect(fakeConnection.start).not.toHaveBeenCalled();

    providerInjector.destroy();
  });

  it("first consumer init triggers buildAndStart; destroy stops (graceMs 0)", async () => {
    const { provideSignalR, hooks } = makeClient(true);
    const providerOptions: SignalROptions = {
      baseUrl: "https://example.test",
      accessTokenFactory: () => "token",
    };

    const parent = TestBed.inject(EnvironmentInjector);
    const providerInjector = createEnvironmentInjector([provideSignalR(providerOptions)], parent);
    const consumer = createEnvironmentInjector([], providerInjector);
    runInInjectionContext(consumer, () => hooks.injectKeepHubAlive(HUB));

    const appRef = TestBed.inject(ApplicationRef);
    await flush(appRef);
    expect(fakeConnection.start).toHaveBeenCalledTimes(1);

    consumer.destroy();
    providerInjector.destroy();
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

// 4: injectHubEvent re-attaches exactly once across a reconnect cycle.
describe("injectHubEvent re-attach across reconnect", () => {
  it("registers exactly one handler after a reconnect cycle", async () => {
    const contextToken = new InjectionToken<SignalRContextValue<any>>("use-signalr-reconnect-test");
    const resolved = resolveHubConfig({ hubs: { [HUB]: {} } } as any, {} as any);
    const provideSignalR = createSignalRProvider<any>(contextToken, [HUB], () => resolved);
    const hooks = createSignalRHooks<any>(contextToken);

    let handlerCalls = 0;
    const providerOptions: SignalROptions = {
      baseUrl: "https://example.test",
      accessTokenFactory: () => "token",
    };

    const parent = TestBed.inject(EnvironmentInjector);
    const providerInjector = createEnvironmentInjector([provideSignalR(providerOptions)], parent);
    const consumer = createEnvironmentInjector([], providerInjector);
    runInInjectionContext(consumer, () =>
      hooks.injectHubEvent(HUB, "OnFoo", () => {
        handlerCalls += 1;
      }),
    );

    const appRef = TestBed.inject(ApplicationRef);
    await flush(appRef);
    await resolveStart(); // connected
    appRef.tick();
    await tick();

    const onCountAfterConnect = onCalls.filter((c) => c.name === "OnFoo").length;
    expect(onCountAfterConnect).toBe(1);

    // Simulate a reconnect cycle: reconnecting -> reconnected.
    onReconnectingHandler?.();
    appRef.tick();
    await tick();
    onReconnectedHandler?.();
    appRef.tick();
    await tick();

    const onCountAfterReconnect = onCalls.filter((c) => c.name === "OnFoo").length;
    const offCount = fakeConnection.off.mock.calls.filter((c) => c[0] === "OnFoo").length;

    // Exactly one detach/attach pair across the reconnect cycle.
    expect(onCountAfterReconnect - onCountAfterConnect).toBe(1);
    expect(offCount).toBe(1);

    void handlerCalls;
    consumer.destroy();
    providerInjector.destroy();
  });
});

// 5: per-hub isolation — a status change on hub B must not notify a
// subscriber that only reads hub A's signal.
describe("injectHubStatus isolation across hubs", () => {
  it("a status change on hub B does not recompute an effect reading hub A's signal", () => {
    const store = createStatusStore<"/hubs/a" | "/hubs/b">();
    const parent = TestBed.inject(EnvironmentInjector);
    const child = createEnvironmentInjector([], parent);

    let runs = 0;
    runInInjectionContext(child, () => {
      const sigA = store.signal("/hubs/a");
      effect(() => {
        sigA();
        runs += 1;
      });
    });

    const appRef = TestBed.inject(ApplicationRef);
    appRef.tick(); // effect's first run happens synchronously on the first tick after creation

    expect(runs).toBe(1);

    store.set("/hubs/b", "connected");
    appRef.tick();
    expect(runs).toBe(1); // unrelated hub: no recomputation

    store.set("/hubs/a", "connected");
    appRef.tick();
    expect(runs).toBe(2); // tracked hub: recomputes

    child.destroy();
  });
});

// 6: injectHubStatus starts "disconnected" and updates through the signal
// after connect(). Uses the REAL provider (not the harness) since the
// harness's statusStore is a plain stub, not a reactive one wired to a
// connection manager.
describe("injectHubStatus signal", () => {
  it("emits 'disconnected' initially and updates after connect()", async () => {
    const contextToken = new InjectionToken<SignalRContextValue<any>>("use-signalr-status-test");
    const resolved = resolveHubConfig({ hubs: { [HUB]: {} } } as any, {} as any);
    const provideSignalR = createSignalRProvider<any>(contextToken, [HUB], () => resolved);
    const hooks = createSignalRHooks<any>(contextToken);

    const readings: string[] = [];
    const providerOptions: SignalROptions = {
      baseUrl: "https://example.test",
      accessTokenFactory: () => "token",
    };

    const parent = TestBed.inject(EnvironmentInjector);
    const providerInjector = createEnvironmentInjector([provideSignalR(providerOptions)], parent);
    const consumer = createEnvironmentInjector([], providerInjector);

    runInInjectionContext(consumer, () => {
      const status = hooks.injectHubStatus(HUB);
      effect(() => {
        readings.push(status());
      });
    });

    const appRef = TestBed.inject(ApplicationRef);
    appRef.tick(); // consumer's own status-reading effect runs first pass
    expect(readings[0]).toBe("disconnected");

    await flush(appRef); // provider's start-effect runs, connection builds
    await resolveStart(); // connected
    appRef.tick();
    await tick();

    expect(readings[readings.length - 1]).toBe("connected");

    consumer.destroy();
    providerInjector.destroy();
  });
});

// 7: DI resolution and assertInInjectionContext enforcement.
describe("DI wiring", () => {
  it("provideSignalR + injectSignalR resolves inside an injection context", () => {
    const contextToken = new InjectionToken<SignalRContextValue<any>>("use-signalr-di-test");
    const resolved = resolveHubConfig({ hubs: { [HUB]: {} } } as any, {} as any);
    const provideSignalR = createSignalRProvider<any>(contextToken, [HUB], () => resolved);
    const hooks = createSignalRHooks<any>(contextToken);

    const parent = TestBed.inject(EnvironmentInjector);
    const providerInjector = createEnvironmentInjector(
      [provideSignalR({ baseUrl: "https://example.test", accessTokenFactory: () => "token" })],
      parent,
    );

    const ctx = runInInjectionContext(providerInjector, () => hooks.injectSignalR());
    expect(ctx).toBeTruthy();
    expect(typeof ctx.getConnection).toBe("function");

    // SSR guarantee: no render pass has happened (no tick), so the connection
    // work scheduled via afterNextRender must not have run.
    expect(fakeConnection.start).not.toHaveBeenCalled();

    providerInjector.destroy();
  });

  it("injectX outside an injection context throws", () => {
    const contextToken = new InjectionToken<SignalRContextValue<any>>("use-signalr-di-throw-test");
    const hooks = createSignalRHooks<any>(contextToken);

    expect(() => hooks.injectSignalR()).toThrow();
  });

  it("injectSignalR below a scope with no provider throws a clear error", () => {
    const contextToken = new InjectionToken<SignalRContextValue<any>>("use-signalr-di-missing-test");
    const hooks = createSignalRHooks<any>(contextToken);

    const parent = TestBed.inject(EnvironmentInjector);
    const child = createEnvironmentInjector([], parent);

    expect(() => runInInjectionContext(child, () => hooks.injectSignalR())).toThrow(
      /injectSignalR must be called/,
    );

    child.destroy();
  });
});
