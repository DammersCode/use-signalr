import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpError, HttpTransportType, HubConnectionBuilder, TransferFormat } from "@microsoft/signalr";
import type { IHubProtocol } from "@microsoft/signalr";
import { FailedToNegotiateWithServerError } from "@microsoft/signalr/dist/esm/Errors.js";
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

const withUrlCalls: Array<{ url: string; options: Record<string, unknown> }> = [];

const builderLog: string[] = [];
const builtBy: unknown[] = [];
const protocolCalls: unknown[] = [];

let fakeConnection: ReturnType<typeof makeFakeConnection>;

vi.mock("@microsoft/signalr", () => {
  class HubConnectionBuilder {
    withUrl(url: string, options: Record<string, unknown>) {
      builderLog.push("withUrl");
      withUrlCalls.push({ url, options });
      return this;
    }
    withHubProtocol(protocol: unknown) {
      builderLog.push("withHubProtocol");
      protocolCalls.push(protocol);
      return this;
    }
    configureLogging() {
      builderLog.push("configureLogging");
      return this;
    }
    withAutomaticReconnect() {
      builderLog.push("withAutomaticReconnect");
      return this;
    }
    build() {
      builderLog.push("build");
      builtBy.push(this);
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
  const HttpTransportType = { None: 0, WebSockets: 1, ServerSentEvents: 2, LongPolling: 4 };
  const TransferFormat = { Text: 1, Binary: 2 };
  return { HubConnectionBuilder, HubConnectionState, HttpError, HttpTransportType, TransferFormat };
});

const HUB = "/hubs/chat" as HubString;

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
    connectedBefore: new Set(),
    onStatus: () => {},
    onError: () => {},
    isCurrent: () => true,
    dispatch: () => {},
  };
}

beforeEach(() => {
  onCalls.length = 0;
  withUrlCalls.length = 0;
  builderLog.length = 0;
  builtBy.length = 0;
  protocolCalls.length = 0;
  startResolves = null;
  startRejects = null;
  fakeConnection = makeFakeConnection();
});

describe("createConnectionManager: withUrl", () => {
  const build = (httpOptions: ResolvedHubConfig["httpOptions"], baseUrl?: string) => {
    const manager = createConnectionManager({
      ...makeDeps(() => baseResolved({ httpOptions })),
      ...(baseUrl === undefined ? {} : { baseUrl }),
    });
    manager.reconcile();
    manager.dispose();
    return withUrlCalls[0]!;
  };

  it("passes httpOptions headers and transport to withUrl", () => {
    const { options } = build({
      headers: { "X-Test": "1" },
      transport: HttpTransportType.WebSockets,
      skipNegotiation: true,
    });
    expect(options.headers).toEqual({ "X-Test": "1" });
    expect(options.transport).toBe(HttpTransportType.WebSockets);
    expect(options.skipNegotiation).toBe(true);
  });

  it("always uses the library accessTokenFactory", async () => {
    const hostile = { headers: {}, accessTokenFactory: () => "evil" };
    const { options } = build(hostile);
    const factory = options.accessTokenFactory as () => Promise<string>;
    await expect(factory()).resolves.toBe("token");
  });

  it.each([
    ["https://x/", "https://x/hubs/a"],
    ["https://x", "https://x/hubs/a"],
    ["https://x//", "https://x/hubs/a"],
    ["https://x/api/", "https://x/api/hubs/a"],
  ])("joins %s with the hub path", (baseUrl, expected) => {
    const manager = createConnectionManager({
      ...makeDeps(() => baseResolved()),
      baseUrl,
      hubs: ["/hubs/a" as HubString],
    });
    manager.reconcile();
    manager.dispose();
    expect(withUrlCalls[0]!.url).toBe(expected);
  });
});

describe("createConnectionManager: pre-bound events", () => {
  it("routes events to dispatch only while the entry is current", () => {
    const dispatch = vi.fn();
    let current = true;
    const manager = createConnectionManager({
      ...makeDeps(() => baseResolved({ events: ["OnFoo"] })),
      dispatch,
      isCurrent: () => current,
    });
    manager.reconcile();
    const handler = onCalls[0]!.fn as (...a: unknown[]) => void;

    handler(1, 2);
    current = false;
    handler(3);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(HUB, "OnFoo", [1, 2]);
    manager.dispose();
  });

  it("binds one dispatcher per declared event before start() resolves", async () => {
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

describe("createConnectionManager: stop() failures", () => {
  it("reports a lazy-stop rejection through onError", async () => {
    const stopError = new Error("stop failed");
    fakeConnection.stop = vi.fn(() => Promise.reject(stopError));
    const onError = vi.fn();
    const deps = makeDeps(() => baseResolved({ lazy: true, graceMs: 0 }));
    const manager = createConnectionManager({ ...deps, onError });

    deps.refCounts.set(HUB, 1);
    manager.reconcile();
    expect(fakeConnection.start).toHaveBeenCalledTimes(1);

    deps.refCounts.set(HUB, 0);
    manager.reconcile(); // last release: schedules the lazy stop
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(fakeConnection.stop).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(HUB, stopError, { source: "connection" });

    manager.dispose();
  });

  it("reports a dispose() stop rejection through onError", async () => {
    const stopError = new Error("stop failed");
    fakeConnection.stop = vi.fn(() => Promise.reject(stopError));
    const onError = vi.fn();
    const manager = createConnectionManager({
      ...makeDeps(() => baseResolved()),
      onError,
    });

    manager.reconcile();
    manager.dispose();
    await Promise.resolve();
    await Promise.resolve();

    expect(fakeConnection.stop).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(HUB, stopError, { source: "connection" });
  });
});

describe("createConnectionManager: timer cleanup", () => {
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

describe("createConnectionManager: isolated user callbacks", () => {
  const fireReconnected = () =>
    (fakeConnection.onreconnected.mock.calls[0]![0] as () => void)();

  it("a throwing reconnect listener leaves status connected and still runs the others", () => {
    const deps = makeDeps(() => baseResolved());
    const statuses: string[] = [];
    const onError = vi.fn();
    const boom = new Error("listener failed");
    const second = vi.fn();
    deps.reconnectListeners.set(
      HUB,
      new Set([
        () => {
          throw boom;
        },
        second,
      ]),
    );
    const manager = createConnectionManager({
      ...deps,
      onStatus: (_hub, status) => statuses.push(status),
      onError,
    });
    manager.reconcile();

    fireReconnected();

    expect(statuses.at(-1)).toBe("connected");
    expect(second).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(HUB, boom, { source: "callback" });
    manager.dispose();
  });

  it("sets connected before it calls the reconnect listeners", () => {
    const deps = makeDeps(() => baseResolved());
    const statuses: string[] = [];
    let statusSeenByListener: string | undefined;
    deps.reconnectListeners.set(
      HUB,
      new Set([() => (statusSeenByListener = statuses.at(-1))]),
    );
    const manager = createConnectionManager({
      ...deps,
      onStatus: (_hub, status) => statuses.push(status),
    });
    manager.reconcile();

    fireReconnected();

    expect(statusSeenByListener).toBe("connected");
    manager.dispose();
  });

  it("a throwing onStatus on connected keeps the status and schedules no retry", async () => {
    vi.useFakeTimers();
    try {
      const statuses: string[] = [];
      const onError = vi.fn();
      const boom = new Error("status callback failed");
      const manager = createConnectionManager({
        ...makeDeps(() => baseResolved()),
        onStatus: (_hub, status) => {
          statuses.push(status);
          if (status === "connected") throw boom;
        },
        onError,
      });
      manager.reconcile();

      startResolves!();
      await Promise.resolve();
      await Promise.resolve();

      expect(statuses).toEqual(["connecting", "connected"]);
      expect(vi.getTimerCount()).toBe(0);
      expect(onError).toHaveBeenCalledWith(HUB, boom, { source: "callback" });
      manager.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores an error thrown by onError itself", async () => {
    const manager = createConnectionManager({
      ...makeDeps(() => baseResolved()),
      onError: () => {
        throw new Error("onError failed");
      },
    });
    manager.reconcile();

    startRejects!(new HttpError("Unauthorized", 401));
    await new Promise((res) => setTimeout(res, 0));

    manager.dispose();
  });
});

describe("createConnectionManager: connecting status", () => {
  it("publishes connecting before start() settles, then connected", async () => {
    const statuses: string[] = [];
    const manager = createConnectionManager({
      ...makeDeps(() => baseResolved()),
      onStatus: (_hub, status) => statuses.push(status),
    });
    manager.reconcile();

    expect(statuses).toEqual(["connecting"]);

    startResolves!();
    await Promise.resolve();
    await Promise.resolve();

    expect(statuses).toEqual(["connecting", "connected"]);
    manager.dispose();
  });

  it("keeps connecting while a retry waits, with no disconnected in between", async () => {
    vi.useFakeTimers();
    try {
      const statuses: string[] = [];
      const manager = createConnectionManager({
        ...makeDeps(() => baseResolved()),
        onStatus: (_hub, status) => statuses.push(status),
      });
      manager.reconcile();

      startRejects!(new Error("transport unavailable"));
      await vi.advanceTimersByTimeAsync(0);
      expect(statuses).not.toContain("disconnected");

      await vi.advanceTimersByTimeAsync(2500);
      expect(fakeConnection.start).toHaveBeenCalledTimes(2);
      startResolves!();
      await vi.advanceTimersByTimeAsync(0);

      expect(statuses).toEqual(["connecting", "connected"]);
      manager.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not publish reconnected when the connection reconnects", () => {
    const statuses: string[] = [];
    const manager = createConnectionManager({
      ...makeDeps(() => baseResolved()),
      onStatus: (_hub, status) => statuses.push(status),
    });
    manager.reconcile();

    (fakeConnection.onreconnected.mock.calls[0]![0] as () => void)();

    expect(statuses).toEqual(["connecting", "connected"]);
    manager.dispose();
  });

  it("publishes disconnected on a non-retriable error", async () => {
    const statuses: string[] = [];
    const manager = createConnectionManager({
      ...makeDeps(() => baseResolved()),
      onStatus: (_hub, status) => statuses.push(status),
    });
    manager.reconcile();

    startRejects!(new HttpError("Unauthorized", 401));
    await new Promise((res) => setTimeout(res, 0));

    expect(statuses).toEqual(["connecting", "disconnected"]);
    manager.dispose();
  });
});

describe("createConnectionManager: recovery", () => {
  const fireClose = (err?: Error) =>
    (fakeConnection.onclose.mock.calls[0]![0] as (e?: Error) => void)(err);

  async function withTimers(run: () => Promise<void>) {
    vi.useFakeTimers();
    try {
      await run();
    } finally {
      vi.useRealTimers();
    }
  }

  async function failAttempt(delay: number) {
    startRejects!(new Error("down"));
    await vi.advanceTimersByTimeAsync(0);
    fakeConnection = makeFakeConnection();
    await vi.advanceTimersByTimeAsync(delay);
  }

  it("rebuilds after onclose(error) and reaches connected", () =>
    withTimers(async () => {
      const statuses: string[] = [];
      const manager = createConnectionManager({
        ...makeDeps(() => baseResolved()),
        onStatus: (_hub, status) => statuses.push(status),
      });
      manager.reconcile();
      startResolves!();
      await vi.advanceTimersByTimeAsync(0);
      const first = fakeConnection;

      fireClose(new Error("server gone"));
      fakeConnection = makeFakeConnection();
      await vi.advanceTimersByTimeAsync(2499);
      expect(fakeConnection.start).not.toHaveBeenCalled();
      expect(statuses.at(-1)).toBe("connecting");

      await vi.advanceTimersByTimeAsync(1);
      expect(fakeConnection.start).toHaveBeenCalledTimes(1);
      expect(manager.getConnection(HUB)).toBe(fakeConnection);
      expect(manager.getConnection(HUB)).not.toBe(first);

      startResolves!();
      await vi.advanceTimersByTimeAsync(0);
      expect(statuses).toEqual(["connecting", "connected", "connecting", "connected"]);
      manager.dispose();
    }));

  it("grows the delay by 2.5 s per attempt and caps it at 30 s", () =>
    withTimers(async () => {
      const manager = createConnectionManager(makeDeps(() => baseResolved()));
      manager.reconcile();
      const delays = [
        2500, 5000, 7500, 10000, 12500, 15000, 17500, 20000, 22500, 25000, 27500, 30000,
        30000, 30000,
      ];

      for (const delay of delays) {
        startRejects!(new Error("transport unavailable"));
        await vi.advanceTimersByTimeAsync(0);
        const next = makeFakeConnection();
        fakeConnection = next;
        await vi.advanceTimersByTimeAsync(delay - 1);
        expect(next.start).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(next.start).toHaveBeenCalledTimes(1);
      }
      manager.dispose();
    }));

  it("resets the attempt counter after a successful connect", () =>
    withTimers(async () => {
      const manager = createConnectionManager(makeDeps(() => baseResolved()));
      manager.reconcile();
      await failAttempt(2500);
      await failAttempt(5000);
      startResolves!();
      await vi.advanceTimersByTimeAsync(0);

      fireClose(new Error("lost"));
      fakeConnection = makeFakeConnection();
      await vi.advanceTimersByTimeAsync(2500);

      expect(fakeConnection.start).toHaveBeenCalledTimes(1);
      manager.dispose();
    }));

  it("stops on a 401 and calls onError once", () =>
    withTimers(async () => {
      const onError = vi.fn();
      const error = new FailedToNegotiateWithServerError(
        "Failed to complete negotiation with the server: Error: Unauthorized: Status code '401'",
      );
      const manager = createConnectionManager({
        ...makeDeps(() => baseResolved()),
        onError,
      });
      manager.reconcile();

      startRejects!(error);
      await vi.advanceTimersByTimeAsync(0);

      expect(vi.getTimerCount()).toBe(0);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(HUB, error, { source: "connection" });
      await vi.advanceTimersByTimeAsync(60000);
      expect(fakeConnection.start).toHaveBeenCalledTimes(1);
      manager.dispose();
    }));

  it("reports a retriable outage once, not once per attempt", () =>
    withTimers(async () => {
      const onError = vi.fn();
      const manager = createConnectionManager({
        ...makeDeps(() => baseResolved()),
        onError,
      });
      manager.reconcile();
      await failAttempt(2500);
      await failAttempt(5000);
      await failAttempt(7500);

      expect(onError).toHaveBeenCalledTimes(1);
      manager.dispose();
    }));

  it("dispose() during the delay builds nothing", () =>
    withTimers(async () => {
      const manager = createConnectionManager(makeDeps(() => baseResolved()));
      manager.reconcile();
      startResolves!();
      await vi.advanceTimersByTimeAsync(0);
      fireClose(new Error("lost"));
      fakeConnection = makeFakeConnection();

      manager.dispose();
      await vi.advanceTimersByTimeAsync(60000);

      expect(fakeConnection.start).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    }));

  it("does not rebuild when the generation is stale", () =>
    withTimers(async () => {
      let current = true;
      const manager = createConnectionManager({
        ...makeDeps(() => baseResolved()),
        isCurrent: () => current,
      });
      manager.reconcile();
      startRejects!(new Error("down"));
      await vi.advanceTimersByTimeAsync(0);
      fakeConnection = makeFakeConnection();
      current = false;

      await vi.advanceTimersByTimeAsync(60000);

      expect(fakeConnection.start).not.toHaveBeenCalled();
      manager.dispose();
    }));

  it("a lazy stop during the delay clears the timer and builds nothing", () =>
    withTimers(async () => {
      const deps = makeDeps(() => baseResolved({ lazy: true }));
      const statuses: string[] = [];
      const manager = createConnectionManager({
        ...deps,
        onStatus: (_hub, status) => statuses.push(status),
      });
      deps.refCounts.set(HUB, 1);
      manager.reconcile();
      startRejects!(new Error("down"));
      await vi.advanceTimersByTimeAsync(0);
      fakeConnection = makeFakeConnection();

      deps.refCounts.set(HUB, 0);
      manager.reconcile();
      await vi.advanceTimersByTimeAsync(60000);

      expect(fakeConnection.start).not.toHaveBeenCalled();
      expect(statuses.at(-1)).toBe("idle");
      manager.dispose();
    }));

  it("rebuilds after onclose with no error, as when auto-reconnect gives up", () =>
    withTimers(async () => {
      const statuses: string[] = [];
      const manager = createConnectionManager({
        ...makeDeps(() => baseResolved()),
        onStatus: (_hub, status) => statuses.push(status),
      });
      manager.reconcile();
      startResolves!();
      await vi.advanceTimersByTimeAsync(0);

      fireClose();
      fakeConnection = makeFakeConnection();
      await vi.advanceTimersByTimeAsync(2500);
      startResolves!();
      await vi.advanceTimersByTimeAsync(0);

      expect(statuses).toEqual(["connecting", "connected", "connecting", "connected"]);
      manager.dispose();
    }));

  it("reports a clean close without a reconnect attempt as a server or proxy close", () =>
    withTimers(async () => {
      const onError = vi.fn();
      const manager = createConnectionManager({ ...makeDeps(() => baseResolved()), onError });
      manager.reconcile();
      startResolves!();
      await vi.advanceTimersByTimeAsync(0);

      fireClose();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0]![1]).toEqual(
        new Error("The server or a proxy closed the connection."),
      );
      manager.dispose();
    }));

  it("reports a clean close after a reconnect attempt as exhausted retries", () =>
    withTimers(async () => {
      const onError = vi.fn();
      const manager = createConnectionManager({ ...makeDeps(() => baseResolved()), onError });
      manager.reconcile();
      startResolves!();
      await vi.advanceTimersByTimeAsync(0);

      (fakeConnection.onreconnecting.mock.calls[0]![0] as () => void)();
      fireClose();

      expect(onError.mock.calls[0]![1]).toEqual(new Error("Reconnect retries exhausted"));
      manager.dispose();
    }));

  it("clears the reconnecting flag when SignalR reconnects", () =>
    withTimers(async () => {
      const onError = vi.fn();
      const manager = createConnectionManager({ ...makeDeps(() => baseResolved()), onError });
      manager.reconcile();
      startResolves!();
      await vi.advanceTimersByTimeAsync(0);

      (fakeConnection.onreconnecting.mock.calls[0]![0] as () => void)();
      (fakeConnection.onreconnected.mock.calls[0]![0] as () => void)();
      fireClose();

      expect(onError.mock.calls[0]![1]).toEqual(
        new Error("The server or a proxy closed the connection."),
      );
      manager.dispose();
    }));
  it("publishes idle when a failure arrives after the hub is no longer wanted", () =>
    withTimers(async () => {
      const deps = makeDeps(() => baseResolved({ lazy: true, graceMs: 5000 }));
      const statuses: string[] = [];
      const manager = createConnectionManager({
        ...deps,
        onStatus: (_hub, status) => statuses.push(status),
      });
      deps.refCounts.set(HUB, 1);
      manager.reconcile();
      deps.refCounts.set(HUB, 0);
      manager.reconcile();

      startRejects!(new Error("down"));
      await vi.advanceTimersByTimeAsync(0);

      expect(statuses.at(-1)).toBe("idle");
      expect(vi.getTimerCount()).toBe(1);
      manager.dispose();
    }));

  it("clears the attempt state when a lazy stop ends a recovery", () =>
    withTimers(async () => {
      const deps = makeDeps(() => baseResolved({ lazy: true }));
      const statuses: string[] = [];
      const onError = vi.fn();
      const manager = createConnectionManager({
        ...deps,
        onStatus: (_hub, status) => statuses.push(status),
        onError,
      });
      deps.refCounts.set(HUB, 1);
      manager.reconcile();
      await failAttempt(2500);
      deps.refCounts.set(HUB, 0);
      manager.reconcile();
      await vi.advanceTimersByTimeAsync(0);
      statuses.length = 0;

      deps.refCounts.set(HUB, 1);
      manager.reconcile();
      expect(statuses).toEqual(["connecting"]);
      startRejects!(new Error("down again"));
      await vi.advanceTimersByTimeAsync(0);

      expect(onError).toHaveBeenCalledTimes(2);
      manager.dispose();
    }));

  it("clears the attempt state after a non-retriable error", () =>
    withTimers(async () => {
      const deps = makeDeps(() => baseResolved({ lazy: true }));
      const statuses: string[] = [];
      const manager = createConnectionManager({
        ...deps,
        onStatus: (_hub, status) => statuses.push(status),
      });
      deps.refCounts.set(HUB, 1);
      manager.reconcile();
      await failAttempt(2500);
      startRejects!(
        new FailedToNegotiateWithServerError(
          "Failed to complete negotiation with the server: Error: Unauthorized: Status code '401'",
        ),
      );
      await vi.advanceTimersByTimeAsync(0);
      deps.refCounts.set(HUB, 0);
      manager.reconcile();
      await vi.advanceTimersByTimeAsync(0);
      statuses.length = 0;

      deps.refCounts.set(HUB, 1);
      manager.reconcile();

      expect(statuses).toEqual(["connecting"]);
      manager.dispose();
    }));

  it("does not rebuild early when reconcile runs during the delay", () =>
    withTimers(async () => {
      const manager = createConnectionManager(makeDeps(() => baseResolved()));
      manager.reconcile();
      startRejects!(new Error("down"));
      await vi.advanceTimersByTimeAsync(0);
      fakeConnection = makeFakeConnection();

      manager.reconcile();

      expect(fakeConnection.start).not.toHaveBeenCalled();
      manager.dispose();
    }));
});

function fakeProtocol(transferFormat: TransferFormat = TransferFormat.Text): IHubProtocol {
  return {
    name: "fake",
    version: 1,
    transferFormat,
    parseMessages: () => [],
    writeMessage: () => "",
  };
}

describe("createConnectionManager: hubProtocol", () => {
  const SSE = { transport: HttpTransportType.ServerSentEvents };

  it("never calls withHubProtocol when no protocol is set", () => {
    const manager = createConnectionManager(makeDeps(() => baseResolved()));
    manager.reconcile();
    expect(builderLog).not.toContain("withHubProtocol");
    manager.dispose();
  });

  it("applies a protocol instance", () => {
    const protocol = fakeProtocol();
    const manager = createConnectionManager(makeDeps(() => baseResolved({ hubProtocol: protocol })));
    manager.reconcile();
    expect(protocolCalls).toEqual([protocol]);
    manager.dispose();
  });

  it("calls a factory once per build and applies its result", () => {
    const protocol = fakeProtocol();
    const factory = vi.fn(() => protocol);
    const manager = createConnectionManager(makeDeps(() => baseResolved({ hubProtocol: factory })));
    manager.reconcile();
    manager.reconcile();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(protocolCalls).toEqual([protocol]);
    manager.dispose();
  });

  it("does not call the factory again on an auto-reconnect", () => {
    const factory = vi.fn(() => fakeProtocol());
    const manager = createConnectionManager(makeDeps(() => baseResolved({ hubProtocol: factory })));
    manager.reconcile();
    const first = fakeConnection;
    (first.onreconnecting.mock.calls[0]![0] as () => void)();
    (first.onreconnected.mock.calls[0]![0] as () => void)();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(manager.getConnection(HUB)).toBe(first);
    manager.dispose();
  });

  it("calls the factory again when a recovery rebuilds the hub", async () => {
    vi.useFakeTimers();
    try {
      const protocols = [fakeProtocol(), fakeProtocol()];
      const factory = vi.fn(() => protocols[factory.mock.calls.length - 1]!);
      const manager = createConnectionManager(makeDeps(() => baseResolved({ hubProtocol: factory })));
      manager.reconcile();
      startRejects!(new Error("down"));
      await vi.advanceTimersByTimeAsync(0);
      fakeConnection = makeFakeConnection();
      await vi.advanceTimersByTimeAsync(2500);
      expect(factory).toHaveBeenCalledTimes(2);
      expect(protocolCalls).toHaveLength(2);
      expect(protocolCalls[0]).toBe(protocols[0]);
      expect(protocolCalls[1]).toBe(protocols[1]);
      manager.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("calls the factory again for a new manager, as a connectionKey rebuild does", () => {
    const factory = vi.fn(() => fakeProtocol());
    const resolve = () => baseResolved({ hubProtocol: factory });
    createConnectionManager(makeDeps(resolve)).reconcile();
    createConnectionManager(makeDeps(resolve)).reconcile();
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("fails a binary factory with SSE as non-retriable and builds nothing", async () => {
    vi.useFakeTimers();
    try {
      const statuses: string[] = [];
      const onError = vi.fn();
      const manager = createConnectionManager({
        ...makeDeps(() => baseResolved({ hubProtocol: () => fakeProtocol(TransferFormat.Binary), httpOptions: SSE })),
        onStatus: (_hub, status) => statuses.push(status),
        onError,
      });
      manager.reconcile();
      manager.reconcile();
      await vi.advanceTimersByTimeAsync(120_000);

      expect(statuses).toEqual(["disconnected"]);
      expect(onError).toHaveBeenCalledTimes(1);
      const error: unknown = onError.mock.calls[0]![1];
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toMatch(/\/hubs\/chat.*Server-Sent Events.*binary/s);
      expect(builderLog).not.toContain("build");
      expect(manager.getConnection(HUB)).toBeNull();
      manager.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("accepts a binary factory with a transport flag set that includes WebSockets", () => {
    const onError = vi.fn();
    const transport = HttpTransportType.ServerSentEvents | HttpTransportType.WebSockets;
    const manager = createConnectionManager({
      ...makeDeps(() =>
        baseResolved({ hubProtocol: () => fakeProtocol(TransferFormat.Binary), httpOptions: { transport } }),
      ),
      onError,
    });
    manager.reconcile();
    expect(onError).not.toHaveBeenCalled();
    expect(builderLog).toContain("build");
    manager.dispose();
  });
});

describe("createConnectionManager: misconfigured hubs", () => {
  it("retries the factory after a lazy hub is released and acquired again", () => {
    const statuses: string[] = [];
    const factory = vi.fn(() => fakeProtocol(TransferFormat.Binary));
    const deps = makeDeps(() =>
      baseResolved({
        lazy: true,
        hubProtocol: factory,
        httpOptions: { transport: HttpTransportType.ServerSentEvents },
      }),
    );
    const manager = createConnectionManager({ ...deps, onStatus: (_hub, status) => statuses.push(status) });

    deps.refCounts.set(HUB, 1);
    manager.reconcile();
    expect(statuses).toEqual(["disconnected"]);
    expect(factory).toHaveBeenCalledTimes(1);

    deps.refCounts.set(HUB, 0);
    manager.reconcile();
    expect(statuses).toEqual(["disconnected", "idle"]);

    deps.refCounts.set(HUB, 1);
    manager.reconcile();
    expect(factory).toHaveBeenCalledTimes(2);
    manager.dispose();
  });

  it("reports a throwing factory once, as disconnected, with no retry and no build", async () => {
    vi.useFakeTimers();
    try {
      const failure = new Error("factory broke");
      const statuses: string[] = [];
      const onError = vi.fn();
      const manager = createConnectionManager({
        ...makeDeps(() => baseResolved({ hubProtocol: () => { throw failure; } })),
        onStatus: (_hub, status) => statuses.push(status),
        onError,
      });
      manager.reconcile();
      manager.reconcile();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0]![1]).toBe(failure);
      expect(statuses).toEqual(["disconnected"]);
      expect(builderLog).not.toContain("build");
      manager.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a throwing configureBuilder hook once, as disconnected, with no retry and no build", async () => {
    vi.useFakeTimers();
    try {
      const failure = new Error("hook broke");
      const statuses: string[] = [];
      const onError = vi.fn();
      const hook = (): HubConnectionBuilder => {
        throw failure;
      };
      const manager = createConnectionManager({
        ...makeDeps(() => baseResolved({ configureBuilders: [hook] })),
        onStatus: (_hub, status) => statuses.push(status),
        onError,
      });
      manager.reconcile();
      manager.reconcile();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0]![1]).toBe(failure);
      expect(statuses).toEqual(["disconnected"]);
      expect(builderLog).not.toContain("build");
      manager.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("createConnectionManager: configureBuilder", () => {
  it("calls the hook once per build with the hub and base URL, after the library calls", () => {
    const hook = vi.fn((builder: HubConnectionBuilder) => {
      builderLog.push("hook");
      return builder;
    });
    const manager = createConnectionManager(
      makeDeps(() => baseResolved({ hubProtocol: fakeProtocol(), configureBuilders: [hook] })),
    );
    manager.reconcile();
    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook.mock.calls[0]![1]).toEqual({ hub: HUB, baseUrl: "https://example.test" });
    expect(builderLog).toEqual([
      "withUrl",
      "withHubProtocol",
      "configureLogging",
      "withAutomaticReconnect",
      "hook",
      "build",
    ]);
    manager.dispose();
  });

  it("runs the global hook before the per-hub hook and builds with the last returned builder", () => {
    const order: string[] = [];
    const first = new HubConnectionBuilder();
    const second = new HubConnectionBuilder();
    const global = vi.fn(() => {
      order.push("global");
      return first;
    });
    const perHub = vi.fn((builder: HubConnectionBuilder) => {
      order.push(builder === first ? "hub-after-global" : "hub-wrong-builder");
      return second;
    });
    const manager = createConnectionManager(makeDeps(() => baseResolved({ configureBuilders: [global, perHub] })));
    manager.reconcile();
    expect(order).toEqual(["global", "hub-after-global"]);
    expect(builtBy).toHaveLength(1);
    expect(builtBy[0]).toBe(second);
    manager.dispose();
  });

  it("runs the hook again on every rebuild", () => {
    const hook = vi.fn((builder: HubConnectionBuilder) => builder);
    const resolve = () => baseResolved({ configureBuilders: [hook] });
    createConnectionManager(makeDeps(resolve)).reconcile();
    createConnectionManager(makeDeps(resolve)).reconcile();
    expect(hook).toHaveBeenCalledTimes(2);
  });
});

describe("createConnectionManager: async user callbacks", () => {
  const flush = () => new Promise((res) => setTimeout(res, 0));

  it("reports a rejecting async reconnect listener through onError", async () => {
    const boom = new Error("async listener");
    const onError = vi.fn();
    const deps = makeDeps(() => baseResolved());
    deps.reconnectListeners.set(HUB, new Set([() => Promise.reject(boom) as unknown as void]));
    const manager = createConnectionManager({ ...deps, onError });
    manager.reconcile();

    (fakeConnection.onreconnected.mock.calls[0]![0] as () => void)();
    await flush();

    expect(onError).toHaveBeenCalledWith(HUB, boom, { source: "callback" });
    manager.dispose();
  });

  it("reports a rejecting async onStatus through onError", async () => {
    const boom = new Error("async status");
    const onError = vi.fn();
    const manager = createConnectionManager({
      ...makeDeps(() => baseResolved()),
      onStatus: () => Promise.reject(boom) as unknown as void,
      onError,
    });
    manager.reconcile();
    await flush();

    expect(onError).toHaveBeenCalledWith(HUB, boom, { source: "callback" });
    manager.dispose();
  });

  it("ignores a rejecting onError that handles an async rejection", async () => {
    const manager = createConnectionManager({
      ...makeDeps(() => baseResolved()),
      onStatus: () => Promise.reject(new Error("async status")) as unknown as void,
      onError: () => Promise.reject(new Error("async onError")) as unknown as void,
    });
    manager.reconcile();
    await flush();

    manager.dispose();
  });
});

describe("createConnectionManager: disposal guards", () => {
  it("never starts the connection when dispose() runs inside the connecting callback", () => {
    const holder: { manager?: ReturnType<typeof createConnectionManager> } = {};
    holder.manager = createConnectionManager({
      ...makeDeps(() => baseResolved()),
      onStatus: (_hub, status) => {
        if (status === "connecting") holder.manager!.dispose();
      },
    });
    holder.manager.reconcile();

    expect(fakeConnection.start).not.toHaveBeenCalled();
    expect(fakeConnection.stop).toHaveBeenCalledTimes(1);
  });

  it("publishes no idle when onclose fires synchronously inside dispose()", async () => {
    const statuses: string[] = [];
    const manager = createConnectionManager({
      ...makeDeps(() => baseResolved()),
      onStatus: (_hub, status) => statuses.push(status),
    });
    manager.reconcile();
    startResolves!();
    await Promise.resolve();
    await Promise.resolve();
    fakeConnection.stop.mockImplementation(() => {
      (fakeConnection.onclose.mock.calls[0]![0] as () => void)();
      return Promise.resolve();
    });

    manager.dispose();

    expect(statuses).toEqual(["connecting", "connected"]);
  });

  it("does not call reconnect listeners when dispose() runs inside the connected callback", () => {
    const listener = vi.fn();
    const deps = makeDeps(() => baseResolved());
    deps.reconnectListeners.set(HUB, new Set([listener]));
    const holder: { manager?: ReturnType<typeof createConnectionManager> } = {};
    holder.manager = createConnectionManager({
      ...deps,
      onStatus: (_hub, status) => {
        if (status === "connected") holder.manager!.dispose();
      },
    });
    holder.manager.reconcile();

    (fakeConnection.onreconnected.mock.calls[0]![0] as () => void)();

    expect(listener).not.toHaveBeenCalled();
  });

  it("fans out to a copy of the reconnect listeners", () => {
    const late = vi.fn();
    const deps = makeDeps(() => baseResolved());
    const set = new Set<() => void>();
    set.add(() => {
      set.add(late);
    });
    deps.reconnectListeners.set(HUB, set);
    const manager = createConnectionManager(deps);
    manager.reconcile();

    (fakeConnection.onreconnected.mock.calls[0]![0] as () => void)();

    expect(late).not.toHaveBeenCalled();
    manager.dispose();
  });
});

describe("createConnectionManager: lazy grace period", () => {
  it("keeps the connection when the hub is acquired again during graceMs", async () => {
    vi.useFakeTimers();
    try {
      const deps = makeDeps(() => baseResolved({ lazy: true, graceMs: 100 }));
      const manager = createConnectionManager(deps);
      deps.refCounts.set(HUB, 1);
      manager.reconcile();
      deps.refCounts.set(HUB, 0);
      manager.reconcile();
      await vi.advanceTimersByTimeAsync(50);
      deps.refCounts.set(HUB, 1);
      manager.reconcile();
      await vi.advanceTimersByTimeAsync(500);

      expect(fakeConnection.stop).not.toHaveBeenCalled();
      expect(manager.getConnection(HUB)).toBe(fakeConnection);
      manager.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("createConnectionManager: non-retriable status codes", () => {
  it.each([400, 403, 404])("stops after one attempt on HTTP %i and reports once", async (status) => {
    vi.useFakeTimers();
    try {
      const statuses: string[] = [];
      const onError = vi.fn();
      const manager = createConnectionManager({
        ...makeDeps(() => baseResolved()),
        onStatus: (_hub, s) => statuses.push(s),
        onError,
      });
      manager.reconcile();

      startRejects!(new HttpError("rejected", status));
      await vi.advanceTimersByTimeAsync(60_000);

      expect(statuses).toEqual(["connecting", "disconnected"]);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(fakeConnection.start).toHaveBeenCalledTimes(1);
      manager.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("createConnectionManager: reconnect listeners after a recovery rebuild", () => {
  const fireClose = (err?: Error) =>
    (fakeConnection.onclose.mock.calls[0]![0] as (e?: Error) => void)(err);

  async function withTimers(run: () => Promise<void>) {
    vi.useFakeTimers();
    try {
      await run();
    } finally {
      vi.useRealTimers();
    }
  }

  async function connectThenLose(manager: { reconcile: () => void }) {
    manager.reconcile();
    startResolves!();
    await vi.advanceTimersByTimeAsync(0);
    fireClose(new Error("server gone"));
    fakeConnection = makeFakeConnection();
    await vi.advanceTimersByTimeAsync(2500);
  }

  it("runs the listeners once when a rebuilt hub connects again", () =>
    withTimers(async () => {
      const deps = makeDeps(() => baseResolved());
      const listener = vi.fn();
      deps.reconnectListeners.set(HUB, new Set([listener]));
      const manager = createConnectionManager(deps);
      manager.reconcile();
      startResolves!();
      await vi.advanceTimersByTimeAsync(0);
      expect(listener).not.toHaveBeenCalled();
      fireClose(new Error("server gone"));
      fakeConnection = makeFakeConnection();
      await vi.advanceTimersByTimeAsync(2500);
      startResolves!();
      await vi.advanceTimersByTimeAsync(0);

      expect(listener).toHaveBeenCalledTimes(1);
      manager.dispose();
    }));

  it("runs the listeners after the status is connected and isolates a throwing one", () =>
    withTimers(async () => {
      const deps = makeDeps(() => baseResolved());
      const onError = vi.fn();
      const statuses: string[] = [];
      const boom = new Error("listener");
      const seen: string[] = [];
      const second = vi.fn(() => seen.push(statuses.at(-1)!));
      deps.reconnectListeners.set(
        HUB,
        new Set([
          () => {
            throw boom;
          },
          second,
        ]),
      );
      const manager = createConnectionManager({
        ...deps,
        onStatus: (_h, s) => statuses.push(s),
        onError,
      });
      await connectThenLose(manager);
      startResolves!();
      await vi.advanceTimersByTimeAsync(0);

      expect(seen).toEqual(["connected"]);
      expect(onError).toHaveBeenCalledWith(HUB, boom, { source: "callback" });
      manager.dispose();
    }));

  it("does not run the listeners when the first connect needed retries", () =>
    withTimers(async () => {
      const deps = makeDeps(() => baseResolved());
      const listener = vi.fn();
      deps.reconnectListeners.set(HUB, new Set([listener]));
      const manager = createConnectionManager(deps);
      manager.reconcile();
      startRejects!(new Error("down"));
      await vi.advanceTimersByTimeAsync(0);
      fakeConnection = makeFakeConnection();
      await vi.advanceTimersByTimeAsync(2500);
      startResolves!();
      await vi.advanceTimersByTimeAsync(0);

      expect(listener).not.toHaveBeenCalled();
      manager.dispose();
    }));

  it("runs the listeners once per recovery, also after failed rebuild attempts", () =>
    withTimers(async () => {
      const deps = makeDeps(() => baseResolved());
      const listener = vi.fn();
      deps.reconnectListeners.set(HUB, new Set([listener]));
      const manager = createConnectionManager(deps);
      await connectThenLose(manager);
      startRejects!(new Error("still down"));
      await vi.advanceTimersByTimeAsync(0);
      fakeConnection = makeFakeConnection();
      await vi.advanceTimersByTimeAsync(5000);
      startResolves!();
      await vi.advanceTimersByTimeAsync(0);

      expect(listener).toHaveBeenCalledTimes(1);
      manager.dispose();
    }));

  it("still runs the listeners once on SignalR's own reconnect", () => {
    const deps = makeDeps(() => baseResolved());
    const listener = vi.fn();
    deps.reconnectListeners.set(HUB, new Set([listener]));
    const manager = createConnectionManager(deps);
    manager.reconcile();

    (fakeConnection.onreconnected.mock.calls[0]![0] as () => void)();

    expect(listener).toHaveBeenCalledTimes(1);
    manager.dispose();
  });

  it("does not run the listeners after a failed recovery build, a release, and a new acquire", () =>
    withTimers(async () => {
      let builds = 0;
      const deps = makeDeps(() =>
        baseResolved({
          lazy: true,
          configureBuilders: [
            (builder) => {
              if (++builds === 2) throw new Error("hook broke");
              return builder;
            },
          ],
        }),
      );
      const listener = vi.fn();
      deps.reconnectListeners.set(HUB, new Set([listener]));
      const manager = createConnectionManager(deps);
      deps.refCounts.set(HUB, 1);
      manager.reconcile();
      startResolves!();
      await vi.advanceTimersByTimeAsync(0);
      fireClose(new Error("server gone"));
      fakeConnection = makeFakeConnection();
      await vi.advanceTimersByTimeAsync(2500);
      deps.refCounts.set(HUB, 0);
      manager.reconcile();
      deps.refCounts.set(HUB, 1);
      manager.reconcile();
      startResolves!();
      await vi.advanceTimersByTimeAsync(0);

      expect(builds).toBe(3);
      expect(listener).not.toHaveBeenCalled();
      manager.dispose();
    }));

  it("does not run the listeners when a lazy hub connects again after a release", () =>
    withTimers(async () => {
      const deps = makeDeps(() => baseResolved({ lazy: true }));
      const listener = vi.fn();
      deps.reconnectListeners.set(HUB, new Set([listener]));
      const manager = createConnectionManager(deps);
      deps.refCounts.set(HUB, 1);
      manager.reconcile();
      startResolves!();
      await vi.advanceTimersByTimeAsync(0);
      deps.refCounts.set(HUB, 0);
      manager.reconcile();
      await vi.advanceTimersByTimeAsync(0);
      fakeConnection = makeFakeConnection();
      deps.refCounts.set(HUB, 1);
      manager.reconcile();
      startResolves!();
      await vi.advanceTimersByTimeAsync(0);

      expect(listener).not.toHaveBeenCalled();
      manager.dispose();
    }));
});

describe("createConnectionManager: onError source", () => {
  it("reports a connect failure with source connection", async () => {
    const onError = vi.fn();
    const manager = createConnectionManager({
      ...makeDeps(() => baseResolved()),
      onError,
    });
    manager.reconcile();
    const err = new HttpError("nope", 401);
    startRejects!(err);
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith(HUB, err, { source: "connection" });
    manager.dispose();
  });

  it("reports a stop rejection with source connection", async () => {
    const onError = vi.fn();
    const boom = new Error("stop failed");
    fakeConnection.stop.mockRejectedValueOnce(boom);
    const manager = createConnectionManager({ ...makeDeps(() => baseResolved()), onError });
    manager.reconcile();
    manager.dispose();
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith(HUB, boom, { source: "connection" });
  });
});
