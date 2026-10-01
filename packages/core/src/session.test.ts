import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpError, TransferFormat } from "@microsoft/signalr";
import type { IHubProtocol } from "@microsoft/signalr";
import { createSignalRSession } from "./session.js";
import type { HubConnectionStatus, HubString, ResolvedHubConfig } from "./types.js";
import type { StatusStore } from "./status-store.js";

// --- Fake @microsoft/signalr ---
// session.ts drives createConnectionManager, which uses only
// HubConnectionBuilder (runtime) and HubConnectionState (a runtime enum)
// from the package. Mirrors connection-manager.test.ts's mocking pattern.
function makeFakeConnection() {
  return {
    on: vi.fn(),
    off: vi.fn(),
    start: vi.fn(() => (startError ? Promise.reject(startError) : Promise.resolve())),
    stop: vi.fn(() => Promise.resolve()),
    onclose: vi.fn(),
    onreconnecting: vi.fn(),
    onreconnected: vi.fn(),
    state: "Disconnected",
  };
}

let startError: unknown;
let fakeConnections: ReturnType<typeof makeFakeConnection>[];
let protocolsApplied: unknown[];

vi.mock("@microsoft/signalr", () => {
  class HubConnectionBuilder {
    withUrl() {
      return this;
    }
    withHubProtocol(protocol: unknown) {
      protocolsApplied.push(protocol);
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
  class HttpError extends Error {
    constructor(
      message: string,
      readonly statusCode: number,
    ) {
      super(message);
    }
  }
  const HttpTransportType = { None: 0, WebSockets: 1, ServerSentEvents: 2, LongPolling: 4 };
  const TransferFormat = { Text: 1, Binary: 2 };
  return { HubConnectionBuilder, HubConnectionState, HttpError, HttpTransportType, TransferFormat };
});

const HUB_A = "/hubs/a" as HubString;
const HUB_B = "/hubs/b" as HubString;

function baseResolved(overrides: Partial<ResolvedHubConfig> = {}): ResolvedHubConfig {
  return {
    lazy: false,
    graceMs: 0,
    reconnect: true,
    logLevel: 0 as ResolvedHubConfig["logLevel"],
    httpOptions: {},
    hubProtocol: undefined,
    configureBuilders: [],
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
    get: (hub) => map.get(hub) ?? "idle",
    set: (hub, status) => {
      map.set(hub, status);
      sets.push({ hub, status });
    },
  };
}

beforeEach(() => {
  fakeConnections = [];
  protocolsApplied = [];
  startError = undefined;
});

describe("createSignalRSession: publicContext", () => {
  it("is one frozen object with only getConnection, getStatus, waitForConnection", () => {
    const statusStore = makeFakeStatusStore();
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore,
      getAccessToken: () => "token",
    });

    expect(Object.isFrozen(session.publicContext)).toBe(true);
    expect(Object.keys(session.publicContext).sort()).toEqual([
      "getConnection",
      "getStatus",
      "waitForConnection",
    ]);
    expect(session.context.publicContext).toBe(session.publicContext);
    expect(session.publicContext.getStatus(HUB_A)).toBe("idle");
    statusStore.set(HUB_A, "connected");
    expect(session.publicContext.getStatus(HUB_A)).toBe("connected");
  });
});

describe("createSignalRSession: update/stop generations", () => {
  it("update() builds eager hubs", () => {
    const statusStore = makeFakeStatusStore();
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore,
      getAccessToken: () => "token",
    });

    session.update({ baseUrl: "https://example.test" });

    expect(fakeConnections).toHaveLength(1);
    expect(fakeConnections[0]!.start).toHaveBeenCalledTimes(1);
    session.stop();
  });

  it("a changed update() disposes the first generation before building the new one", () => {
    const statusStore = makeFakeStatusStore();
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore,
      getAccessToken: () => "token",
    });

    session.update({ baseUrl: "https://example.test" });
    const firstConn = fakeConnections[0]!;
    expect(firstConn.stop).not.toHaveBeenCalled();

    session.update({ baseUrl: "https://example.test/2" });

    expect(firstConn.stop).toHaveBeenCalledTimes(1);
    expect(fakeConnections).toHaveLength(2);
    session.stop();
  });
});

describe("createSignalRSession: stop()", () => {
  it("disposes and marks all hubs idle in the statusStore", () => {
    const statusStore = makeFakeStatusStore();
    const session = createSignalRSession({
      hubs: [HUB_A, HUB_B],
      resolve: () => baseResolved(),
      statusStore,
      getAccessToken: () => "token",
    });

    session.update({ baseUrl: "https://example.test" });
    const conn = fakeConnections[0]!;
    let connectionWasAvailableDuringNotify = false;
    const setStatus = statusStore.set;
    statusStore.set = (hub, status) => {
      if (hub === HUB_A && status === "idle") {
        connectionWasAvailableDuringNotify =
          session.context.getConnection(HUB_A) === conn;
      }
      setStatus(hub, status);
    };

    session.stop();

    expect(conn.stop).toHaveBeenCalledTimes(1);
    expect(connectionWasAvailableDuringNotify).toBe(true);
    expect(statusStore.get(HUB_A)).toBe("idle");
    expect(statusStore.get(HUB_B)).toBe("idle");
  });

  it("calling stop() twice is safe", () => {
    const statusStore = makeFakeStatusStore();
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore,
      getAccessToken: () => "token",
    });

    session.update({ baseUrl: "https://example.test" });
    session.stop();
    expect(() => session.stop()).not.toThrow();
  });

  it("is safe to call before any update()", () => {
    const statusStore = makeFakeStatusStore();
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore,
      getAccessToken: () => "token",
    });

    expect(() => session.stop()).not.toThrow();
    expect(statusStore.get(HUB_A)).toBe("idle");
  });
});

describe("createSignalRSession: idle status", () => {
  it("reports idle before any update()", () => {
    const statusStore = makeFakeStatusStore();
    createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore,
      getAccessToken: () => "token",
    });

    expect(statusStore.get(HUB_A)).toBe("idle");
  });

  it("a lazy stop publishes idle", async () => {
    const statusStore = makeFakeStatusStore();
    const onStatusChange = vi.fn();
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved({ lazy: true, graceMs: 0 }),
      statusStore,
      getAccessToken: () => "token",
      onStatusChange,
    });

    session.update({ baseUrl: "https://example.test" });
    session.context.acquire(HUB_A);
    await Promise.resolve();
    session.context.release(HUB_A);
    await Promise.resolve();
    await Promise.resolve();

    expect(statusStore.get(HUB_A)).toBe("idle");
    expect(onStatusChange).toHaveBeenLastCalledWith(HUB_A, "idle");
    session.stop();
  });

  it("never publishes reconnected, only connected, after a reconnect", async () => {
    const statusStore = makeFakeStatusStore();
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore,
      getAccessToken: () => "token",
    });

    session.update({ baseUrl: "https://example.test" });
    await Promise.resolve();
    (fakeConnections[0]!.onreconnecting.mock.calls[0]![0] as () => void)();
    (fakeConnections[0]!.onreconnected.mock.calls[0]![0] as () => void)();

    const published: string[] = statusStore.sets.map((s) => s.status);
    expect(published).toEqual(["idle", "connecting", "connected", "reconnecting", "connected"]);
    session.stop();
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

    session.update({ baseUrl: "https://example.test" });
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

    session.update({ baseUrl: "https://example.test" });
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

  it("ref counts survive a stop -> update cycle", () => {
    const statusStore = makeFakeStatusStore();
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved({ lazy: true, graceMs: 0 }),
      statusStore,
      getAccessToken: () => "token",
    });

    session.update({ baseUrl: "https://example.test" });
    session.context.acquire(HUB_A); // consumer mounted before the rebuild
    expect(fakeConnections).toHaveLength(1);

    session.stop();
    session.update({ baseUrl: "https://example.test" });

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

    session.update({ baseUrl: "https://example.test" });
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
  function makeSession() {
    return createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore: makeFakeStatusStore(),
      getAccessToken: () => "token",
    });
  }

  it("a wait that starts before session.update({ baseUrl:  }) resolves after the connect", async () => {
    const session = makeSession();
    const waiting = session.context.waitForConnection(HUB_A, 1000);

    session.update({ baseUrl: "https://example.test" });

    await expect(waiting).resolves.toBe(fakeConnections[0]);
    session.stop();
  });

  it("a wait resolves when the recovered connection connects", async () => {
    vi.useFakeTimers();
    try {
      const session = makeSession();
      session.update({ baseUrl: "https://example.test" });
      await vi.advanceTimersByTimeAsync(0);
      const onClose = fakeConnections[0]!.onclose.mock.calls[0]![0] as (e?: Error) => void;

      onClose(new Error("server gone"));
      const waiting = session.context.waitForConnection(HUB_A, 60000);
      await vi.advanceTimersByTimeAsync(2500);

      expect(fakeConnections).toHaveLength(2);
      await expect(waiting).resolves.toBe(fakeConnections[1]);
      session.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("resolves at once when the hub is already connected", async () => {
    const session = makeSession();
    session.update({ baseUrl: "https://example.test" });
    await Promise.resolve();
    await Promise.resolve();
    fakeConnections[0]!.state = "Connected";

    await expect(session.context.waitForConnection(HUB_A, 50)).resolves.toBe(
      fakeConnections[0],
    );
    session.stop();
  });

  it("a resolved wait clears its timeout timer", async () => {
    vi.useFakeTimers();
    try {
      const session = makeSession();
      const waiting = session.context.waitForConnection(HUB_A, 30_000);
      expect(vi.getTimerCount()).toBe(1);

      session.update({ baseUrl: "https://example.test" });
      await vi.advanceTimersByTimeAsync(0);

      await expect(waiting).resolves.toBe(fakeConnections[0]);
      expect(vi.getTimerCount()).toBe(0);
      session.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a wait during reconnecting does not block the event loop", async () => {
    vi.useFakeTimers();
    try {
      const session = makeSession();
      session.update({ baseUrl: "https://example.test" });
      await vi.advanceTimersByTimeAsync(0);
      const conn = fakeConnections[0]!;
      conn.state = "Reconnecting";
      (conn.onreconnecting.mock.calls[0]![0] as () => void)();

      const ticks = vi.fn();
      const interval = setInterval(ticks, 100);
      const waiting = session.context.waitForConnection(HUB_A, 30_000);
      await vi.advanceTimersByTimeAsync(1000);
      expect(ticks).toHaveBeenCalledTimes(10);

      conn.state = "Connected";
      (conn.onreconnected.mock.calls[0]![0] as () => void)();
      await expect(waiting).resolves.toBe(conn);

      clearInterval(interval);
      session.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a wait that starts before a rebuild resolves with the new connection", async () => {
    const session = makeSession();
    session.update({ baseUrl: "https://example.test" });
    const waiting = session.context.waitForConnection(HUB_A, 1000);

    session.update({ baseUrl: "https://example.test/2" });

    await expect(waiting).resolves.toBe(fakeConnections[1]);
    session.stop();
  });

  it("a wait survives stop() and resolves on the next update()", async () => {
    const session = makeSession();
    session.update({ baseUrl: "https://example.test" });
    session.stop();
    const waiting = session.context.waitForConnection(HUB_A, 1000);

    session.update({ baseUrl: "https://example.test" });

    await expect(waiting).resolves.toBe(fakeConnections[1]);
    session.stop();
  });

  it("rejects with the timeout message and leaves no timer behind", async () => {
    vi.useFakeTimers();
    try {
      const session = makeSession();
      const waiting = session.context.waitForConnection(HUB_A, 50);
      const settled = expect(waiting).rejects.toThrow(
        "Timeout waiting for SignalR connection to /hubs/a (50ms)",
      );

      await vi.advanceTimersByTimeAsync(50);

      await settled;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("an abort rejects with AbortError and leaves no timer behind", async () => {
    vi.useFakeTimers();
    try {
      const session = makeSession();
      const controller = new AbortController();
      const waiting = session.context.waitForConnection(HUB_A, 30_000, controller.signal);

      controller.abort();

      await expect(waiting).rejects.toBe(controller.signal.reason);
      expect(vi.getTimerCount()).toBe(0);
      session.update({ baseUrl: "https://example.test" });
      await vi.advanceTimersByTimeAsync(0);
      session.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("an already aborted signal rejects at once", async () => {
    const session = makeSession();

    await expect(
      session.context.waitForConnection(HUB_A, 1000, AbortSignal.abort()),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("createSignalRSession: stale generation callbacks", () => {
  it("a stale connection's onclose does not overwrite the live generation's status", async () => {
    const statusStore = makeFakeStatusStore();
    const onError = vi.fn();
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore,
      getAccessToken: () => "token",
      onError,
    });

    session.update({ baseUrl: "https://example.test" });
    const staleConn = fakeConnections[0]!;
    await Promise.resolve();

    session.update({ baseUrl: "https://example.test/2" }); // new generation replaces the old
    await Promise.resolve();

    expect(fakeConnections).toHaveLength(2);
    expect(statusStore.get(HUB_A)).toBe("connected");

    const staleOnClose = staleConn.onclose.mock.calls[0]![0] as (err?: unknown) => void;
    staleOnClose(new Error("transport lost"));

    expect(statusStore.get(HUB_A)).toBe("connected");
    expect(onError).not.toHaveBeenCalled();
    session.stop();
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

    session.update({ baseUrl: "https://example.test" });
    statusStore.sets.length = 0; // clear the initial "connecting" writes

    const connA = fakeConnections[0]!;
    const onreconnectingHandler = connA.onreconnecting.mock.calls[0]![0] as () => void;
    onreconnectingHandler();

    expect(statusStore.sets).toEqual([{ hub: HUB_A, status: "reconnecting" }]);
    expect(statusStore.sets.some((s) => s.hub === HUB_B)).toBe(false);
    session.stop();
  });
});

describe("createSignalRSession: isolated user callbacks", () => {
  it("a throwing onStatusChange reaches onError", async () => {
    const statusStore = makeFakeStatusStore();
    const boom = new Error("onStatusChange failed");
    const onError = vi.fn();
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore,
      getAccessToken: () => "token",
      onStatusChange: () => {
        throw boom;
      },
      onError,
    });

    session.update({ baseUrl: "https://example.test" });
    await Promise.resolve();
    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith(HUB_A, boom, { source: "callback" });
    session.stop();
  });

  it("a throwing status store write still calls onStatusChange and reaches onError", async () => {
    const statusStore = makeFakeStatusStore();
    const boom = new Error("store failed");
    statusStore.set = () => {
      throw boom;
    };
    const onStatusChange = vi.fn();
    const onError = vi.fn();
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore,
      getAccessToken: () => "token",
      onStatusChange,
      onError,
    });

    session.update({ baseUrl: "https://example.test" });
    await Promise.resolve();
    await Promise.resolve();

    expect(onStatusChange).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(HUB_A, boom, { source: "callback" });
    session.stop();
  });

  it("a throwing onStatusChange on connected keeps the store connected", async () => {
    const statusStore = makeFakeStatusStore();
    const onError = vi.fn();
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore,
      getAccessToken: () => "token",
      onStatusChange: (_hub, status) => {
        if (status === "connected") throw new Error("boom");
      },
      onError,
    });

    session.update({ baseUrl: "https://example.test" });
    await Promise.resolve();
    await Promise.resolve();

    expect(statusStore.get(HUB_A)).toBe("connected");
    expect(onError).toHaveBeenCalledTimes(1);
    session.stop();
  });

  it("a throwing onError causes no unhandled rejection", async () => {
    const statusStore = makeFakeStatusStore();
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore,
      getAccessToken: () => "token",
      onStatusChange: () => {
        throw new Error("status failed");
      },
      onError: () => {
        throw new Error("onError failed");
      },
    });

    session.update({ baseUrl: "https://example.test" });
    await new Promise((res) => setTimeout(res, 0));

    session.stop();
  });
});

describe("createSignalRSession: lifecycle guards", () => {
  it("stop() calls onStatusChange for hubs that were not idle", () => {
    const statusStore = makeFakeStatusStore();
    const onStatusChange = vi.fn();
    const session = createSignalRSession({
      hubs: [HUB_A, HUB_B],
      resolve: (hub) => baseResolved({ lazy: hub === HUB_B }),
      statusStore,
      getAccessToken: () => "token",
      onStatusChange,
    });

    session.update({ baseUrl: "https://example.test" });
    onStatusChange.mockClear();
    session.stop();

    expect(onStatusChange).toHaveBeenCalledTimes(1);
    expect(onStatusChange).toHaveBeenCalledWith(HUB_A, "idle");
  });

  it.each(["onclose", "onreconnecting", "onreconnected"] as const)(
    "an old lazy connection's %s does not write status over the new one",
    async (handlerName) => {
      const statusStore = makeFakeStatusStore();
      const session = createSignalRSession({
        hubs: [HUB_A],
        resolve: () => baseResolved({ lazy: true }),
        statusStore,
        getAccessToken: () => "token",
      });

      session.update({ baseUrl: "https://example.test" });
      session.context.acquire(HUB_A);
      const oldConn = fakeConnections[0]!;
      session.context.release(HUB_A);
      await Promise.resolve();
      session.context.acquire(HUB_A);
      await Promise.resolve();
      expect(fakeConnections).toHaveLength(2);
      expect(statusStore.get(HUB_A)).toBe("connected");

      statusStore.sets.length = 0;
      const handler = oldConn[handlerName].mock.calls[0]![0] as () => void;
      handler();

      expect(statusStore.sets).toEqual([]);
      session.stop();
    },
  );

  it("a queued lazy stop does nothing after stop()", async () => {
    const statusStore = makeFakeStatusStore();
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved({ lazy: true }),
      statusStore,
      getAccessToken: () => "token",
    });

    session.update({ baseUrl: "https://example.test" });
    session.context.acquire(HUB_A);
    const conn = fakeConnections[0]!;
    session.context.release(HUB_A);
    session.stop();
    statusStore.sets.length = 0;
    await Promise.resolve();

    expect(conn.stop).toHaveBeenCalledTimes(1);
    expect(statusStore.sets).toEqual([]);
  });

  it("update() on a running session resets status through idle first", () => {
    const statusStore = makeFakeStatusStore();
    const onStatusChange = vi.fn();
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore,
      getAccessToken: () => "token",
      onStatusChange,
    });

    session.update({ baseUrl: "https://example.test" });
    session.update({ baseUrl: "https://example.test/2" });

    expect(statusStore.sets.map((s) => s.status)).toEqual([
      "idle",
      "connecting",
      "idle",
      "connecting",
    ]);
    expect(onStatusChange).toHaveBeenCalledWith(HUB_A, "idle");
    session.stop();
  });
});

describe("createSignalRSession: update()", () => {
  const URL = "https://example.test";
  function makeSession() {
    return createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore: makeFakeStatusStore(),
      getAccessToken: () => "token",
    });
  }

  beforeEach(() => {
    fakeConnections = [];
  });

  it("builds connections once for equal values", () => {
    const session = makeSession();
    session.update({ baseUrl: URL, enabled: true, connectionKey: "k" });
    session.update({ baseUrl: URL, enabled: true, connectionKey: "k" });
    expect(fakeConnections).toHaveLength(1);
    session.stop();
  });

  it("rebuilds once for a new connectionKey", () => {
    const session = makeSession();
    session.update({ baseUrl: URL, connectionKey: 1 });
    session.update({ baseUrl: URL, connectionKey: 2 });
    session.update({ baseUrl: URL, connectionKey: 2 });
    expect(fakeConnections).toHaveLength(2);
    session.stop();
  });

  it("stops when disabled and starts again when enabled", () => {
    const session = makeSession();
    session.update({ baseUrl: URL, enabled: true });
    session.update({ baseUrl: URL, enabled: false });
    expect(session.context.getConnection(HUB_A)).toBeNull();
    expect(fakeConnections[0]!.stop).toHaveBeenCalled();
    session.update({ baseUrl: URL, enabled: true });
    expect(fakeConnections).toHaveLength(2);
    session.stop();
  });

  it("starts again after stop() with the old values", () => {
    const session = makeSession();
    session.update({ baseUrl: URL, enabled: true });
    session.stop();
    session.update({ baseUrl: URL, enabled: true });
    expect(fakeConnections).toHaveLength(2);
    session.stop();
  });

  it("applies the first update without a baseUrl as a plain stop", () => {
    const session = makeSession();
    expect(() => session.update({ enabled: false })).not.toThrow();
    expect(fakeConnections).toHaveLength(0);
  });
});

describe("createSignalRSession: event registry", () => {
  const URL = "https://example.test";

  function makeSession(onError?: (hub: HubString, error: unknown) => void) {
    return createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved({ events: ["OnFoo"] }),
      statusStore: makeFakeStatusStore(),
      getAccessToken: () => "token",
      onError,
    });
  }

  function push(conn: ReturnType<typeof makeFakeConnection>, event: string, ...args: unknown[]) {
    const call = conn.on.mock.calls.find((c) => (c as unknown[])[0] === event);
    ((call as unknown[])[1] as (...a: unknown[]) => void)(...args);
  }

  it("delivers a message in the same task as the start resolve to an early subscriber", async () => {
    const session = makeSession();
    const handler = vi.fn();
    session.context.subscribe(HUB_A, "OnFoo", handler);
    session.update({ baseUrl: URL });
    const conn = fakeConnections[0]!;

    push(conn, "OnFoo", 1, "a");
    await conn.start.mock.results[0]!.value;

    expect(handler).toHaveBeenCalledWith(1, "a");
    session.stop();
  });

  it("keeps delivering after a connectionKey rebuild without a new subscribe", () => {
    const session = makeSession();
    const handler = vi.fn();
    session.context.subscribe(HUB_A, "OnFoo", handler);
    session.update({ baseUrl: URL, connectionKey: "k1" });
    session.update({ baseUrl: URL, connectionKey: "k2" });
    expect(fakeConnections).toHaveLength(2);

    push(fakeConnections[1]!, "OnFoo", 2);

    expect(handler).toHaveBeenCalledWith(2);
    session.stop();
  });

  it("calls conn.on once per declared event for any number of handlers", () => {
    const session = makeSession();
    session.context.subscribe(HUB_A, "OnFoo", vi.fn());
    session.context.subscribe(HUB_A, "OnFoo", vi.fn());
    session.context.subscribe(HUB_A, "OnFoo", vi.fn());
    session.update({ baseUrl: URL });

    expect(fakeConnections[0]!.on).toHaveBeenCalledTimes(1);
    session.stop();
  });

  it("runs the other handlers and reports the error when one handler throws", () => {
    const onError = vi.fn();
    const session = makeSession(onError);
    const boom = new Error("boom");
    const before = vi.fn();
    const after = vi.fn();
    session.context.subscribe(HUB_A, "OnFoo", before);
    session.context.subscribe(HUB_A, "OnFoo", () => {
      throw boom;
    });
    session.context.subscribe(HUB_A, "OnFoo", after);
    session.update({ baseUrl: URL });

    push(fakeConnections[0]!, "OnFoo", 3);

    expect(before).toHaveBeenCalledWith(3);
    expect(after).toHaveBeenCalledWith(3);
    expect(onError).toHaveBeenCalledWith(HUB_A, boom, { source: "callback" });
    session.stop();
  });

  it("stops delivering after unsubscribe", () => {
    const session = makeSession();
    const handler = vi.fn();
    const unsubscribe = session.context.subscribe(HUB_A, "OnFoo", handler);
    session.update({ baseUrl: URL });
    const conn = fakeConnections[0]!;

    push(conn, "OnFoo", 1);
    unsubscribe();
    push(conn, "OnFoo", 2);

    expect(handler).toHaveBeenCalledTimes(1);
    session.stop();
  });

  it("keeps handlers across stop() and update()", () => {
    const session = makeSession();
    const handler = vi.fn();
    session.context.subscribe(HUB_A, "OnFoo", handler);
    session.update({ baseUrl: URL });
    session.stop();
    session.update({ baseUrl: URL });

    push(fakeConnections[1]!, "OnFoo", 4);

    expect(handler).toHaveBeenCalledWith(4);
    session.stop();
  });

  it("drops a late message from a stale connection", () => {
    const session = makeSession();
    const handler = vi.fn();
    session.context.subscribe(HUB_A, "OnFoo", handler);
    session.update({ baseUrl: URL, connectionKey: "k1" });
    const stale = fakeConnections[0]!;
    session.update({ baseUrl: URL, connectionKey: "k2" });

    push(stale, "OnFoo", 5);

    expect(handler).not.toHaveBeenCalled();
    session.stop();
  });

  it("drops a push from a replaced connection of the same generation", async () => {
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved({ lazy: true, graceMs: 0, events: ["OnFoo"] }),
      statusStore: makeFakeStatusStore(),
      getAccessToken: () => "token",
    });
    const handler = vi.fn();
    session.context.subscribe(HUB_A, "OnFoo", handler);
    session.update({ baseUrl: URL });
    session.context.acquire(HUB_A);
    const first = fakeConnections[0]!;
    session.context.release(HUB_A);
    await Promise.resolve();
    await Promise.resolve();
    session.context.acquire(HUB_A);
    expect(fakeConnections).toHaveLength(2);

    push(first, "OnFoo", 1);

    expect(handler).not.toHaveBeenCalled();
    session.stop();
  });

  it("does not call a handler that subscribes during dispatch until the next message", () => {
    const session = makeSession();
    const late = vi.fn();
    session.context.subscribe(HUB_A, "OnFoo", () => {
      session.context.subscribe(HUB_A, "OnFoo", late);
    });
    session.update({ baseUrl: URL });
    const conn = fakeConnections[0]!;

    push(conn, "OnFoo", 1);
    expect(late).not.toHaveBeenCalled();

    push(conn, "OnFoo", 2);
    expect(late).toHaveBeenCalledWith(2);
    session.stop();
  });
});

function fakeProtocol(name: string): IHubProtocol {
  return {
    name,
    version: 1,
    transferFormat: TransferFormat.Text,
    parseMessages: () => [],
    writeMessage: () => "",
  };
}

describe("createSignalRSession: hubProtocol switch", () => {
  it("applies the factory's new protocol after a connectionKey rebuild", () => {
    const protocolA = fakeProtocol("a");
    const protocolB = fakeProtocol("b");
    let useA = true;
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved({ hubProtocol: () => (useA ? protocolA : protocolB) }),
      statusStore: makeFakeStatusStore(),
      getAccessToken: () => "token",
    });

    session.update({ baseUrl: "https://example.test", connectionKey: "k1" });
    useA = false;
    session.update({ baseUrl: "https://example.test", connectionKey: "k2" });

    expect(protocolsApplied).toHaveLength(2);
    expect(protocolsApplied[0]).toBe(protocolA);
    expect(protocolsApplied[1]).toBe(protocolB);
    session.stop();
  });
});

describe("createSignalRSession: async user callbacks", () => {
  const URL = "https://example.test";
  const flush = () => new Promise((res) => setTimeout(res, 0));

  it("reports a rejecting async event handler through onError", async () => {
    const boom = new Error("async handler");
    const onError = vi.fn();
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved({ events: ["OnFoo"] }),
      statusStore: makeFakeStatusStore(),
      getAccessToken: () => "token",
      onError,
    });
    session.context.subscribe(HUB_A, "OnFoo", () => Promise.reject(boom) as unknown as void);
    session.update({ baseUrl: URL });
    const call = fakeConnections[0]!.on.mock.calls[0] as unknown[];

    (call[1] as () => void)();
    await flush();

    expect(onError).toHaveBeenCalledWith(HUB_A, boom, { source: "callback" });
    session.stop();
  });

  it("reports a rejecting async onReconnected listener through onError", async () => {
    const boom = new Error("async reconnected");
    const onError = vi.fn();
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore: makeFakeStatusStore(),
      getAccessToken: () => "token",
      onError,
    });
    session.context.registerReconnect(HUB_A, () => Promise.reject(boom) as unknown as void);
    session.update({ baseUrl: URL });

    (fakeConnections[0]!.onreconnected.mock.calls[0]![0] as () => void)();
    await flush();

    expect(onError).toHaveBeenCalledWith(HUB_A, boom, { source: "callback" });
    session.stop();
  });

  it("reports a rejecting async onStatusChange through onError", async () => {
    const boom = new Error("async status");
    const onError = vi.fn();
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore: makeFakeStatusStore(),
      getAccessToken: () => "token",
      onStatusChange: () => Promise.reject(boom) as unknown as void,
      onError,
    });

    session.update({ baseUrl: URL });
    await flush();

    expect(onError).toHaveBeenCalledWith(HUB_A, boom, { source: "callback" });
    session.stop();
  });
});

describe("createSignalRSession: re-entrant callbacks", () => {
  const URL = "https://example.test";

  it("stop() inside the connecting callback leaves no live connection", async () => {
    const holder: { session?: ReturnType<typeof createSignalRSession> } = {};
    holder.session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore: makeFakeStatusStore(),
      getAccessToken: () => "token",
      onStatusChange: (_hub, status) => {
        if (status === "connecting") holder.session!.stop();
      },
    });

    holder.session.update({ baseUrl: URL });
    await new Promise((res) => setTimeout(res, 0));

    expect(fakeConnections.every((c) => c.start.mock.calls.length === 0)).toBe(true);
    expect(holder.session.context.getConnection(HUB_A)).toBeNull();
  });

  it("update() inside the connecting callback leaves exactly one live connection", async () => {
    const holder: { session?: ReturnType<typeof createSignalRSession> } = {};
    let nested = false;
    holder.session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore: makeFakeStatusStore(),
      getAccessToken: () => "token",
      onStatusChange: (_hub, status) => {
        if (status !== "connecting" || nested) return;
        nested = true;
        holder.session!.update({ baseUrl: URL, connectionKey: "new" });
      },
    });
    const session = holder.session;

    session.update({ baseUrl: URL, connectionKey: "old" });
    await new Promise((res) => setTimeout(res, 0));

    const live = fakeConnections.filter((c) => c.start.mock.calls.length > 0);
    expect(live).toHaveLength(1);
    expect(session.context.getConnection(HUB_A)).toBe(live[0]);
    session.update({ baseUrl: URL, connectionKey: "new" });
    expect(fakeConnections).toHaveLength(2);
    session.stop();
  });
});

describe("createSignalRSession: duplicate status guard", () => {
  it("publishes idle once when stop() makes onclose fire synchronously", async () => {
    const onStatusChange = vi.fn();
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore: makeFakeStatusStore(),
      getAccessToken: () => "token",
      onStatusChange,
    });
    session.update({ baseUrl: "https://example.test" });
    await new Promise((res) => setTimeout(res, 0));
    const conn = fakeConnections[0]!;
    conn.stop.mockImplementation(() => {
      (conn.onclose.mock.calls[0]![0] as () => void)();
      return Promise.resolve();
    });
    onStatusChange.mockClear();

    session.stop();

    expect(onStatusChange.mock.calls.filter((c) => c[1] === "idle")).toHaveLength(1);
  });
});

describe("createSignalRSession: waitForConnection timers and listeners", () => {
  function makeSession() {
    return createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore: makeFakeStatusStore(),
      getAccessToken: () => "token",
    });
  }

  it("sets no timer for an infinite timeout", async () => {
    vi.useFakeTimers();
    try {
      const session = makeSession();
      const controller = new AbortController();
      const waiting = session.context.waitForConnection(HUB_A, Infinity, controller.signal);
      expect(vi.getTimerCount()).toBe(0);
      controller.abort();
      await expect(waiting).rejects.toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clamps a timeout above 2^31-1 so it does not fire at once", async () => {
    vi.useFakeTimers();
    try {
      const session = makeSession();
      const controller = new AbortController();
      const onSettle = vi.fn();
      const waiting = session.context
        .waitForConnection(HUB_A, 2 ** 31 + 1000, controller.signal)
        .catch(onSettle);

      await vi.advanceTimersByTimeAsync(1000);
      expect(onSettle).not.toHaveBeenCalled();
      controller.abort();
      await waiting;
    } finally {
      vi.useRealTimers();
    }
  });

  it("removes the abort listener when the wait resolves", async () => {
    const session = makeSession();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const waiting = session.context.waitForConnection(HUB_A, 1000, controller.signal);

    session.update({ baseUrl: "https://example.test" });
    await waiting;

    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    session.stop();
  });
});

describe("createSignalRSession: waitForConnection that can never succeed", () => {
  function makeSession() {
    return createSignalRSession({
      hubs: [HUB_A, HUB_B],
      resolve: () => baseResolved(),
      statusStore: makeFakeStatusStore(),
      getAccessToken: () => "token",
    });
  }

  it("rejects new waits of all hubs at once when update() disables the session", async () => {
    const session = makeSession();
    session.update({ baseUrl: "https://example.test", enabled: true });
    session.update({ baseUrl: "https://example.test", enabled: false });
    await expect(session.context.waitForConnection(HUB_A, 60_000)).rejects.toThrow(
      "SignalR is disabled: /hubs/a",
    );
    await expect(session.context.waitForConnection(HUB_B, 60_000)).rejects.toThrow(
      "SignalR is disabled: /hubs/b",
    );
  });

  it("rejects a wait that is already pending when update() disables the session", async () => {
    const session = makeSession();
    session.update({ baseUrl: "https://example.test", enabled: true });
    session.stop();
    const pending = session.context.waitForConnection(HUB_A, 60_000);
    session.update({ baseUrl: undefined, enabled: true });
    await expect(pending).rejects.toThrow("SignalR is disabled: /hubs/a");
  });

  it("rejects new waits at once when baseUrl is missing", async () => {
    const session = makeSession();
    session.update({ baseUrl: undefined, enabled: true });
    await expect(session.context.waitForConnection(HUB_A, 60_000)).rejects.toThrow(
      "SignalR is disabled",
    );
  });

  it("waits normally again after a later update() enables the session", async () => {
    const session = makeSession();
    session.update({ baseUrl: "https://example.test", enabled: false });
    session.update({ baseUrl: "https://example.test", enabled: true });
    await expect(session.context.waitForConnection(HUB_A, 1000)).resolves.toBe(
      fakeConnections[0],
    );
    session.stop();
  });

  it("keeps waiting before the first update()", async () => {
    const session = makeSession();
    const waiting = session.context.waitForConnection(HUB_A, 1000);
    session.update({ baseUrl: "https://example.test", enabled: true });
    await expect(waiting).resolves.toBe(fakeConnections[0]);
    session.stop();
  });

  it("keeps waiting across a rebuild with a new connectionKey", async () => {
    const session = makeSession();
    session.update({ baseUrl: "https://example.test", enabled: true, connectionKey: 1 });
    const waiting = session.context.waitForConnection(HUB_A, 1000);
    session.update({ baseUrl: "https://example.test", enabled: true, connectionKey: 2 });
    await expect(waiting).resolves.toBe(fakeConnections[2]);
    session.stop();
  });

  it("keeps waiting after a plain stop()", async () => {
    const session = makeSession();
    session.update({ baseUrl: "https://example.test" });
    session.stop();
    const waiting = session.context.waitForConnection(HUB_A, 30);
    await expect(waiting).rejects.toThrow("Timeout waiting");
  });

  it("rejects pending and new waits when the hub is disconnected after a 401", async () => {
    const session = makeSession();
    startError = new HttpError("Unauthorized", 401);
    const pending = session.context.waitForConnection(HUB_A, 60_000);
    session.update({ baseUrl: "https://example.test", enabled: true });
    await expect(pending).rejects.toThrow(/\/hubs\/a.*Unauthorized/);
    await expect(session.context.waitForConnection(HUB_A, 60_000)).rejects.toThrow(
      /\/hubs\/a.*Unauthorized/,
    );
    session.stop();
  });

  it("does not reject the waits of a hub that did not fail", async () => {
    const session = createSignalRSession({
      hubs: [HUB_A, HUB_B],
      resolve: (hub) => baseResolved({ lazy: hub === HUB_B }),
      statusStore: makeFakeStatusStore(),
      getAccessToken: () => "token",
    });
    startError = new HttpError("Unauthorized", 401);
    session.update({ baseUrl: "https://example.test", enabled: true });
    await expect(session.context.waitForConnection(HUB_B, 30)).rejects.toThrow("Timeout waiting");
    session.stop();
  });

  it("waits again after a release moves the failed hub to another status", async () => {
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved({ lazy: true }),
      statusStore: makeFakeStatusStore(),
      getAccessToken: () => "token",
    });
    startError = new HttpError("Unauthorized", 401);
    session.update({ baseUrl: "https://example.test" });
    session.context.acquire(HUB_A);
    await expect(session.context.waitForConnection(HUB_A, 1000)).rejects.toThrow("Unauthorized");
    session.context.release(HUB_A);
    await Promise.resolve();
    startError = undefined;
    const waiting = session.context.waitForConnection(HUB_A, 1000);
    session.context.acquire(HUB_A);
    await expect(waiting).resolves.toBeDefined();
    session.stop();
  });

  it("clears the failure on stop(), so a later wait times out", async () => {
    vi.useFakeTimers();
    try {
      const session = makeSession();
      startError = new HttpError("Unauthorized", 401);
      session.update({ baseUrl: "https://example.test" });
      await vi.advanceTimersByTimeAsync(0);
      await expect(session.context.waitForConnection(HUB_A, 1000)).rejects.toThrow("Unauthorized");
      session.stop();
      const settled = expect(session.context.waitForConnection(HUB_A, 50)).rejects.toThrow(
        "Timeout waiting",
      );
      await vi.advanceTimersByTimeAsync(50);
      await settled;
    } finally {
      vi.useRealTimers();
    }
  });

  it("waits again after a new update() clears the failure", async () => {
    const session = makeSession();
    startError = new HttpError("Unauthorized", 401);
    session.update({ baseUrl: "https://example.test" });
    await expect(session.context.waitForConnection(HUB_A, 1000)).rejects.toThrow("Unauthorized");
    startError = undefined;
    session.update({ baseUrl: "https://example.test", connectionKey: 2 });
    await expect(session.context.waitForConnection(HUB_A, 1000)).resolves.toBeDefined();
    session.stop();
  });
});

describe("createSignalRSession: onError source", () => {
  function makeSession(
    onError: (hub: HubString, err: unknown, info: { source: string }) => void,
    extra: Record<string, unknown> = {},
  ) {
    return createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore: makeFakeStatusStore(),
      getAccessToken: () => "token",
      onError,
      ...extra,
    });
  }

  it("reports a connect failure with source connection", async () => {
    const onError = vi.fn();
    const err = new HttpError("Unauthorized", 401);
    startError = err;
    const session = makeSession(onError);
    session.update({ baseUrl: "https://example.test" });
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith(HUB_A, err, { source: "connection" });
    session.stop();
  });

  it("reports an event handler failure with source callback", () => {
    const onError = vi.fn();
    const boom = new Error("handler");
    const session = makeSession(onError, { resolve: () => baseResolved({ events: ["Ev"] }) });
    session.context.subscribe(HUB_A, "Ev", () => {
      throw boom;
    });
    session.update({ baseUrl: "https://example.test" });
    const dispatcher = fakeConnections[0]!.on.mock.calls[0]![1] as () => void;
    dispatcher();
    expect(onError).toHaveBeenCalledWith(HUB_A, boom, { source: "callback" });
    session.stop();
  });

  it("reports an onStatusChange failure with source callback", () => {
    const onError = vi.fn();
    const boom = new Error("status");
    const session = makeSession(onError, {
      onStatusChange: () => {
        throw boom;
      },
    });
    session.update({ baseUrl: "https://example.test" });
    expect(onError).toHaveBeenCalledWith(HUB_A, boom, { source: "callback" });
    session.stop();
  });

  it("reports a status store failure with source callback", () => {
    const onError = vi.fn();
    const boom = new Error("store");
    const statusStore = makeFakeStatusStore();
    statusStore.set = () => {
      throw boom;
    };
    const session = makeSession(onError, { statusStore });
    session.update({ baseUrl: "https://example.test" });
    expect(onError).toHaveBeenCalledWith(HUB_A, boom, { source: "callback" });
    session.stop();
  });

  it("accepts an onError that takes two parameters", () => {
    const seen: unknown[] = [];
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore: makeFakeStatusStore(),
      getAccessToken: () => "token",
      onError: (hub, err) => seen.push(hub, err),
      onStatusChange: () => {
        throw new Error("x");
      },
    });
    session.update({ baseUrl: "https://example.test" });
    expect(seen).toHaveLength(2);
    session.stop();
  });
});

describe("createSignalRSession: error names", () => {
  function makeSession() {
    return createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore: makeFakeStatusStore(),
      getAccessToken: () => "token",
    });
  }

  it("names the error of a disabled session", async () => {
    const session = makeSession();
    session.update({ baseUrl: undefined, enabled: true });
    await expect(session.context.waitForConnection(HUB_A, 60_000)).rejects.toMatchObject({
      name: "SignalRDisabledError",
      message: "SignalR is disabled: /hubs/a",
    });
  });

  it("names the error of a pending wait that update() disables", async () => {
    const session = makeSession();
    session.stop();
    const pending = session.context.waitForConnection(HUB_A, 60_000);
    session.update({ baseUrl: undefined, enabled: true });
    await expect(pending).rejects.toMatchObject({ name: "SignalRDisabledError" });
  });

  it("names the error of a hub that stopped after a non-retriable error", async () => {
    const session = makeSession();
    startError = new HttpError("Unauthorized", 401);
    session.update({ baseUrl: "https://example.test", enabled: true });
    await expect(session.context.waitForConnection(HUB_A, 60_000)).rejects.toMatchObject({
      name: "SignalRDisconnectedError",
      message: expect.stringContaining("/hubs/a is disconnected"),
    });
    session.stop();
  });

  it("names the timeout error", async () => {
    const session = makeSession();
    await expect(session.context.waitForConnection(HUB_A, 20)).rejects.toMatchObject({
      name: "SignalRTimeoutError",
      message: "Timeout waiting for SignalR connection to /hubs/a (20ms)",
    });
  });
});

describe("createSignalRSession: reconnect callbacks after a rebuild", () => {
  const URL = "https://example.test";
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  function makeSession(lazy = false) {
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved({ lazy }),
      statusStore: makeFakeStatusStore(),
      getAccessToken: () => "token",
    });
    const callback = vi.fn();
    session.context.registerReconnect(HUB_A, callback);
    return { session, callback };
  }

  it("does not run on the first connect", async () => {
    const { session, callback } = makeSession();
    session.update({ baseUrl: URL, connectionKey: 1 });
    await settle();

    expect(callback).not.toHaveBeenCalled();
    session.stop();
  });

  it.each([
    ["connectionKey", { baseUrl: URL, connectionKey: 2 }],
    ["baseUrl", { baseUrl: "https://other.test", connectionKey: 1 }],
  ])("runs once after a rebuild from a %s change", async (_name, next) => {
    const { session, callback } = makeSession();
    session.update({ baseUrl: URL, connectionKey: 1 });
    await settle();
    session.update(next);
    await settle();

    expect(callback).toHaveBeenCalledTimes(1);
    session.stop();
  });

  it("runs once after enabled goes false and true again", async () => {
    const { session, callback } = makeSession();
    session.update({ baseUrl: URL, enabled: true });
    await settle();
    session.update({ baseUrl: URL, enabled: false });
    await settle();
    expect(callback).not.toHaveBeenCalled();
    session.update({ baseUrl: URL, enabled: true });
    await settle();

    expect(callback).toHaveBeenCalledTimes(1);
    session.stop();
  });

  it("runs after a rebuild while a lazy hub keeps its consumer", async () => {
    const { session, callback } = makeSession(true);
    session.update({ baseUrl: URL, connectionKey: 1 });
    session.context.acquire(HUB_A);
    await settle();
    session.update({ baseUrl: URL, connectionKey: 2 });
    await settle();

    expect(callback).toHaveBeenCalledTimes(1);
    session.stop();
  });

  it("does not run when update() applies after a public stop()", async () => {
    const { session, callback } = makeSession();
    session.update({ baseUrl: URL, connectionKey: 1 });
    await settle();
    session.stop();
    session.update({ baseUrl: URL, connectionKey: 1 });
    await settle();

    expect(callback).not.toHaveBeenCalled();
    session.stop();
  });

  it("does not run when a lazy hub stops and a new consumer starts it", async () => {
    const { session, callback } = makeSession(true);
    session.update({ baseUrl: URL });
    session.context.acquire(HUB_A);
    await settle();
    session.context.release(HUB_A);
    await settle();
    session.context.acquire(HUB_A);
    await settle();

    expect(fakeConnections).toHaveLength(2);
    expect(callback).not.toHaveBeenCalled();
    session.stop();
  });

  it("forgets a lazy hub that rebuilds inside its grace period", async () => {
    const callback = vi.fn();
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved({ lazy: true, graceMs: 5000 }),
      statusStore: makeFakeStatusStore(),
      getAccessToken: () => "token",
    });
    session.context.registerReconnect(HUB_A, callback);
    session.update({ baseUrl: URL, connectionKey: 1 });
    session.context.acquire(HUB_A);
    await settle();
    session.context.release(HUB_A);
    session.update({ baseUrl: URL, connectionKey: 2 });
    session.context.acquire(HUB_A);
    await settle();

    expect(callback).not.toHaveBeenCalled();
    session.stop();
  });
});

describe("createSignalRSession: public API", () => {
  it("has no start()", () => {
    const session = createSignalRSession({
      hubs: [HUB_A],
      resolve: () => baseResolved(),
      statusStore: makeFakeStatusStore(),
      getAccessToken: () => "token",
    });

    expect(Object.keys(session).sort()).toEqual(["context", "publicContext", "stop", "update"]);
  });
});
