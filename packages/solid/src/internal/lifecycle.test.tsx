import { createContext, createEffect, createRoot } from "solid-js";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@solidjs/testing-library";
import { resolveHubConfig } from "@dammers/use-signalr-core";
import { createSignalRProvider } from "./create-provider.js";
import { createSignalRHooks } from "./create-hooks.js";
import { createStatusStore } from "../status-store.js";
import { makeHarness } from "./test-harness.js";
import type { SignalRContextValue } from "../types.js";

const HUB = "/hubs/chat" as const;
const tick = () => new Promise((r) => setTimeout(r, 0));

// --- Fake @microsoft/signalr, mirroring packages/core/src/connection-manager.test.ts ---
let startResolvers: Array<() => void> = [];
let onCloseHandler: ((err?: unknown) => void) | undefined;
let fakeConnection: ReturnType<typeof makeFakeConnection>;

function makeFakeConnection() {
  const conn = {
    on: vi.fn(),
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
    onreconnecting: vi.fn(),
    onreconnected: vi.fn(),
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
  startResolvers = [];
  onCloseHandler = undefined;
  fakeConnection = makeFakeConnection();
});

// 1 & 2: refcounting via the harness's acquire/release counters.
describe("lazy hub refcounting (harness)", () => {
  it("unmounting one of two consumers does not release to zero", () => {
    const h = makeHarness();
    function Consumer() {
      h.hooks.useHubConsumer(HUB);
      return null;
    }
    const view1 = render(() => (
      <h.Provider>
        <Consumer />
      </h.Provider>
    ));
    const view2 = render(() => (
      <h.Provider>
        <Consumer />
      </h.Provider>
    ));

    expect(h.acquireCount).toBe(2);
    view1.unmount();
    expect(h.releaseCount).toBe(1);
    expect(h.acquireCount).toBeGreaterThan(h.releaseCount);

    view2.unmount();
  });

  it("unmounting the last consumer releases fully (counts balance)", () => {
    const h = makeHarness();
    function Consumer() {
      h.hooks.useHubConsumer(HUB);
      return null;
    }
    const view1 = render(() => (
      <h.Provider>
        <Consumer />
      </h.Provider>
    ));
    const view2 = render(() => (
      <h.Provider>
        <Consumer />
      </h.Provider>
    ));

    view1.unmount();
    view2.unmount();

    expect(h.acquireCount).toBe(2);
    expect(h.releaseCount).toBe(2);
  });
});

// 3: lazy hub with the real provider + mocked signalr.
describe("lazy hub (real provider, mocked signalr)", () => {
  function makeClient(lazy: boolean) {
    const Context = createContext<SignalRContextValue<any> | null>(null);
    const resolved = resolveHubConfig({ hubs: { [HUB]: { lazy, graceMs: 0 } } }, HUB);
    const SignalRProvider = createSignalRProvider<any>(
      Context,
      [HUB],
      () => resolved,
    );
    const hooks = createSignalRHooks<any>(Context);
    return { SignalRProvider, hooks };
  }

  it("no connection built at mount without consumers", async () => {
    const { SignalRProvider } = makeClient(true);
    const view = render(() => (
      <SignalRProvider
        baseUrl="https://example.test"
        accessTokenFactory={() => "token"}
      >
        <div>idle</div>
      </SignalRProvider>
    ));
    await tick();
    expect(fakeConnection.start).not.toHaveBeenCalled();
    view.unmount();
  });

  it("first consumer mount triggers buildAndStart; unmount stops (graceMs 0)", async () => {
    const { SignalRProvider, hooks } = makeClient(true);

    function Consumer() {
      hooks.useHubConsumer(HUB);
      return null;
    }

    const view = render(() => (
      <SignalRProvider
        baseUrl="https://example.test"
        accessTokenFactory={() => "token"}
      >
        <Consumer />
      </SignalRProvider>
    ));
    await tick();
    expect(fakeConnection.start).toHaveBeenCalledTimes(1);

    view.unmount();
    // graceMs 0 schedules the stop via queueMicrotask. Unmounting the whole
    // tree at once tears down both the consumer's refcount release AND the
    // provider's own manager disposal, so stop() may be invoked from either
    // path (or both) on the same underlying connection — either way, the
    // hub must end up stopped.
    await tick();
    await tick();
    expect(fakeConnection.stop).toHaveBeenCalled();
  });
});

// 5: per-hub isolation — a status change on hub B must not re-run an effect
// that only reads hub A's accessor.
describe("useHubStatus isolation across hubs", () => {
  it("a status change on hub B does not re-run an effect tracking hub A", async () => {
    let disposeRoot!: () => void;
    let runs = 0;
    let store!: ReturnType<typeof createStatusStore<"/hubs/a" | "/hubs/b">>;

    createRoot((dispose) => {
      disposeRoot = dispose;
      store = createStatusStore<"/hubs/a" | "/hubs/b">();
      createEffect(() => {
        store.get("/hubs/a");
        runs += 1;
      });
    });

    await tick(); // createEffect's first run is scheduled, not synchronous
    expect(runs).toBe(1);

    store.set("/hubs/b", "connected");
    await tick();
    expect(runs).toBe(1); // unrelated hub: no re-run

    store.set("/hubs/a", "connected");
    await tick();
    expect(runs).toBe(2); // tracked hub: re-runs

    disposeRoot();
  });
});

// 6: useHubStatus starts "connecting" and updates through the accessor.
// Uses the REAL provider (not the harness) since the harness's statusStore
// is a plain stub, not a reactive signal, so it cannot demonstrate the
// accessor updating a tracking scope.
describe("useHubStatus accessor", () => {
  it("returns 'connecting' initially and updates through the accessor after connect()", async () => {
    const Context = createContext<SignalRContextValue<any> | null>(null);
    const resolved = resolveHubConfig({ hubs: { [HUB]: {} } }, HUB);
    const SignalRProvider = createSignalRProvider<any>(
      Context,
      [HUB],
      () => resolved,
    );
    const hooks = createSignalRHooks<any>(Context);

    const readings: string[] = [];
    function Watcher() {
      const status = hooks.useHubStatus(HUB);
      createEffect(() => {
        readings.push(status());
      });
      return null;
    }

    const view = render(() => (
      <SignalRProvider
        baseUrl="https://example.test"
        accessTokenFactory={() => "token"}
      >
        <Watcher />
      </SignalRProvider>
    ));

    expect(readings[0]).toBe("connecting");

    await resolveStart(); // connected

    expect(readings[readings.length - 1]).toBe("connected");

    view.unmount();
  });
});
