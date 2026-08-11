import { describe, it, expect, vi, beforeEach } from "vitest";
import { createConnectionManager } from "./connection-manager.js";
import type { ConnectionManagerDeps } from "./connection-manager.js";
import type { HubString, ResolvedHubConfig } from "./types.js";

// --- Fake @microsoft/signalr ---
// connection-manager.ts uses HubConnectionBuilder (runtime) and
// HubConnectionState (a runtime enum) directly; its retry classifier in
// config.ts also needs HttpError. Everything else it imports is type-only.
const onCalls: Array<{ name: string; fn: unknown }> = [];
let startResolves: (() => void) | null = null;
let startRejects: ((err: unknown) => void) | null = null;

function makeFakeConnection() {
  return {
    on: vi.fn((name: string, fn: unknown) => {
      onCalls.push({ name, fn });
    }),
    off: vi.fn(),
    start: vi.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          startResolves = resolve;
          startRejects = reject;
        }),
    ),
    stop: vi.fn(() => Promise.resolve()),
    onclose: vi.fn(),
    onreconnecting: vi.fn(),
    onreconnected: vi.fn(),
    state: "Disconnected",
  };
}

let fakeConnection: ReturnType<typeof makeFakeConnection>;

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
  class HttpError extends Error {
    constructor(
      message: string,
      readonly statusCode: number,
    ) {
      super(message);
    }
  }
  return { HubConnectionBuilder, HubConnectionState, HttpError };
});

const HUB = "/hubs/chat" as HubString;

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

function makeDeps(
  resolve: (hub: HubString) => ResolvedHubConfig,
): ConnectionManagerDeps<HubString> {
  return {
    baseUrl: "https://example.test",
    hubs: [HUB],
    resolve,
    getAccessToken: () => "token",
    refCounts: new Map(),
    stopTimers: new Map(),
    reconnectListeners: new Map(),
    onStatus: () => {},
    onError: () => {},
    isCurrent: () => true,
  };
}

beforeEach(() => {
  onCalls.length = 0;
  startResolves = null;
  startRejects = null;
  fakeConnection = makeFakeConnection();
});

describe("createConnectionManager: pre-bound events", () => {
  it("binds every declared event to a no-op handler before start() resolves", async () => {
    const resolve = () => baseResolved({ events: ["OnFoo", "OnBar"] });
    const manager = createConnectionManager(makeDeps(resolve));

    manager.reconcile();

    // start() is in-flight (unresolved) at this point -> events must already
    // be bound, proving the binding happens before start, not after.
    expect(fakeConnection.start).toHaveBeenCalledTimes(1);
    expect(startResolves).not.toBeNull();

    const boundNames = onCalls.map((c) => c.name);
    expect(boundNames).toEqual(["OnFoo", "OnBar"]);
    expect(onCalls.every((c) => typeof c.fn === "function")).toBe(true);

    startResolves!();
    await Promise.resolve();
    manager.dispose();
  });

  it("does not call on() at build time when events is empty", async () => {
    const resolve = () => baseResolved({ events: [] });
    const manager = createConnectionManager(makeDeps(resolve));

    manager.reconcile();

    expect(fakeConnection.on).not.toHaveBeenCalled();

    startResolves!();
    await Promise.resolve();
    manager.dispose();
  });
});

describe("createConnectionManager: timer cleanup", () => {
  it("waitForConnection clears its timeout timer once readiness wins", async () => {
    vi.useFakeTimers();
    try {
      const manager = createConnectionManager(makeDeps(() => baseResolved()));
      manager.reconcile();

      const waiting = manager.waitForConnection(HUB, 30_000);
      await Promise.resolve(); // let waitForConnection register its timeout

      const withTimeoutPending = vi.getTimerCount();
      expect(withTimeoutPending).toBeGreaterThan(0);

      fakeConnection.state = "Connected";
      startResolves!();
      await expect(waiting).resolves.toBe(fakeConnection);

      expect(vi.getTimerCount()).toBeLessThan(withTimeoutPending);
      expect(vi.getTimerCount()).toBe(0);

      manager.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("dispose() clears a pending connect-retry timer", async () => {
    vi.useFakeTimers();
    try {
      const manager = createConnectionManager(makeDeps(() => baseResolved()));
      manager.reconcile();

      startRejects!(new Error("transport unavailable"));
      await Promise.resolve();
      await Promise.resolve();

      expect(vi.getTimerCount()).toBe(1); // the scheduled retry

      manager.dispose();

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

// --- Type-level exhaustiveness check ---
// The real compile-time proof lives in connection-manager.events.type-test.ts,
// included by tsconfig and verified by `npm run typecheck`. Vitest's esbuild
// transform does not type-check, so `@ts-expect-error` assertions placed only
// in a *.test.ts file are not enforced by `npm run test` or `npm run
// typecheck` — see that file for the enforced version of this guarantee.
