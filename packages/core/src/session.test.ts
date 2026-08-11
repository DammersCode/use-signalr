import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSignalRSession } from "./session";
import type { HubConnectionStatus, HubString, ResolvedHubConfig } from "./types";
import type { StatusStore } from "./status-store";

// --- Fake @microsoft/signalr ---
// session.ts drives createConnectionManager, which uses only
// HubConnectionBuilder (runtime) and HubConnectionState (a runtime enum)
// from the package. Mirrors connection-manager.test.ts's mocking pattern.
function makeFakeConnection() {
  return {
    on: vi.fn(),
    off: vi.fn(),
    start: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
    onclose: vi.fn(),
    onreconnecting: vi.fn(),
    onreconnected: vi.fn(),
    state: "Disconnected",
  };
}

let fakeConnections: ReturnType<typeof makeFakeConnection>[];

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
      const conn = makeFakeConnection();
      fakeConnections.push(conn);
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
  return { HubConnectionBuilder, HubConnectionState };
});

const HUB_A = "/hubs/a" as HubString;
const HUB_B = "/hubs/b" as HubString;

function baseResolved(overrides: Partial<ResolvedHubConfig> = {}): ResolvedHubConfig {
  return {
    lazy: false,
    graceMs: 0,
    reconnect: true,
    maxConnectRetries: 2,
    logLevel: 0 as ResolvedHubConfig["logLevel"],
    events: [],
    ...overrides,
  };
}

/** Simple in-memory fake StatusStore that records every set() call. */
function makeFakeStatusStore(): StatusStore<HubString> & {
  sets: Array<{ hub: HubString; status: HubConnectionStatus }>;
} {
  const map = new Map<HubString, HubConnectionStatus>();
  const sets: Array<{ hub: HubString; status: HubConnectionStatus }> = [];
  return {
    sets,
    get: (hub) => map.get(hub) ?? "disconnected",
    set: (hub, status) => {
      map.set(hub, status);
      sets.push({ hub, status });
    },
  };
}

beforeEach(() => {
  fakeConnections = [];
});

describe("createSignalRSession: start/stop generations", () => {
  it("start() builds eager hubs", () => {
    const statusStore = makeFakeStatusStore();
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore,
      getAccessToken: () => "token",
    });

    session.start("https://example.test");

    expect(fakeConnections).toHaveLength(1);
    expect(fakeConnections[0]!.start).toHaveBeenCalledTimes(1);
    session.stop();
  });

  it("a second start() disposes the first generation before building the new one", () => {
    const statusStore = makeFakeStatusStore();
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore,
      getAccessToken: () => "token",
    });

    session.start("https://example.test");
    const firstConn = fakeConnections[0]!;
    expect(firstConn.stop).not.toHaveBeenCalled();

    session.start("https://example.test/2");

    expect(firstConn.stop).toHaveBeenCalledTimes(1);
    expect(fakeConnections).toHaveLength(2);
    session.stop();
  });
});

describe("createSignalRSession: stop()", () => {
  it("disposes and marks all hubs disconnected in the statusStore", () => {
    const statusStore = makeFakeStatusStore();
    const session = createSignalRSession({
      hubs: [HUB_A, HUB_B],
      resolve: () => baseResolved(),
      statusStore,
      getAccessToken: () => "token",
    });

    session.start("https://example.test");
    const conn = fakeConnections[0]!;

    session.stop();

    expect(conn.stop).toHaveBeenCalledTimes(1);
    expect(statusStore.get(HUB_A)).toBe("disconnected");
    expect(statusStore.get(HUB_B)).toBe("disconnected");
  });

  it("calling stop() twice is safe", () => {
    const statusStore = makeFakeStatusStore();
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore,
      getAccessToken: () => "token",
    });

    session.start("https://example.test");
    session.stop();
    expect(() => session.stop()).not.toThrow();
  });

  it("is safe to call before any start()", () => {
    const statusStore = makeFakeStatusStore();
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore,
      getAccessToken: () => "token",
    });

    expect(() => session.stop()).not.toThrow();
    expect(statusStore.get(HUB_A)).toBe("disconnected");
  });
});

describe("createSignalRSession: ref counting", () => {
  it("acquire twice then release once keeps a lazy hub connected", async () => {
    const statusStore = makeFakeStatusStore();
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved({ lazy: true, graceMs: 0 }),
      statusStore,
      getAccessToken: () => "token",
    });

    session.start("https://example.test");
    expect(fakeConnections).toHaveLength(0); // lazy: not built until acquired

    session.context.acquire(HUB_A);
    session.context.acquire(HUB_A);
    expect(fakeConnections).toHaveLength(1);

    session.context.release(HUB_A);
    await Promise.resolve();
    await Promise.resolve();

    // still referenced once: not torn down
    expect(fakeConnections[0]!.stop).not.toHaveBeenCalled();
    session.stop();
  });

  it("the final release triggers teardown (graceMs=0, microtask flush)", async () => {
    const statusStore = makeFakeStatusStore();
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved({ lazy: true, graceMs: 0 }),
      statusStore,
      getAccessToken: () => "token",
    });

    session.start("https://example.test");
    session.context.acquire(HUB_A);
    expect(fakeConnections).toHaveLength(1);
    const conn = fakeConnections[0]!;

    session.context.release(HUB_A);
    expect(conn.stop).not.toHaveBeenCalled(); // teardown is scheduled, not sync

    await Promise.resolve();
    await Promise.resolve();

    expect(conn.stop).toHaveBeenCalledTimes(1);
    session.stop();
  });

  it("ref counts survive a stop -> start cycle", () => {
    const statusStore = makeFakeStatusStore();
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved({ lazy: true, graceMs: 0 }),
      statusStore,
      getAccessToken: () => "token",
    });

    session.start("https://example.test");
    session.context.acquire(HUB_A); // consumer mounted before the rebuild
    expect(fakeConnections).toHaveLength(1);

    session.stop();
    session.start("https://example.test");

    // the hub is desired again immediately, without a second acquire
    expect(fakeConnections).toHaveLength(2);
    expect(fakeConnections[1]!.start).toHaveBeenCalledTimes(1);
    session.stop();
  });
});

describe("createSignalRSession: registerReconnect", () => {
  it("returns a working unsubscribe; fan-out calls only still-registered callbacks", () => {
    const statusStore = makeFakeStatusStore();
    const session = createSignalRSession({
      hubs: [HUB_A, HUB_B],
      resolve: () => baseResolved(),
      statusStore,
      getAccessToken: () => "token",
    });

    session.start("https://example.test");
    const connA = fakeConnections[0]!;

    const cbA1 = vi.fn();
    const cbA2 = vi.fn();
    const cbB = vi.fn();
    const unsubA1 = session.context.registerReconnect(HUB_A, cbA1);
    session.context.registerReconnect(HUB_A, cbA2);
    session.context.registerReconnect(HUB_B, cbB);

    unsubA1();

    // fire hub A's onreconnected handler, simulating the underlying connection
    const onreconnectedHandler = connA.onreconnected.mock.calls[0]![0] as () => void;
    onreconnectedHandler();

    expect(cbA1).not.toHaveBeenCalled(); // unsubscribed
    expect(cbA2).toHaveBeenCalledTimes(1);
    expect(cbB).not.toHaveBeenCalled(); // different hub
    session.stop();
  });
});

describe("createSignalRSession: waitForConnection", () => {
  it("rejects with the documented message when no generation is live", async () => {
    const statusStore = makeFakeStatusStore();
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore,
      getAccessToken: () => "token",
    });

    await expect(session.context.waitForConnection(HUB_A, 10)).rejects.toThrow(
      "SignalR not connected: /hubs/a",
    );
  });
});

describe("createSignalRSession: status granularity", () => {
  it("a status change on hub A does not write to hub B's entry", () => {
    const statusStore = makeFakeStatusStore();
    const session = createSignalRSession({
      hubs: [HUB_A, HUB_B],
      resolve: () => baseResolved(),
      statusStore,
      getAccessToken: () => "token",
    });

    session.start("https://example.test");
    statusStore.sets.length = 0; // clear the initial "connecting" writes

    const connA = fakeConnections[0]!;
    const onreconnectingHandler = connA.onreconnecting.mock.calls[0]![0] as () => void;
    onreconnectingHandler();

    expect(statusStore.sets).toEqual([{ hub: HUB_A, status: "reconnecting" }]);
    expect(statusStore.sets.some((s) => s.hub === HUB_B)).toBe(false);
    session.stop();
  });
});
