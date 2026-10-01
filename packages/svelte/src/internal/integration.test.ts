import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/svelte";
import { writable } from "svelte/store";
import type { Readable } from "svelte/store";
import { createSignalRClient } from "../create-signalr-client.js";
import { event, method } from "@dammers/use-signalr-core";
import ProviderWithChild from "./test-components/ProviderWithChild.svelte";
import Runner from "./test-components/Runner.svelte";
import type { SignalRProviderProps } from "../types.js";

const HUB = "/hubs/chat" as const;
const BASE_URL = "https://example.test";
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

type Handler = (...args: unknown[]) => void;

interface FakeConnection {
  state: string;
  handlers: Map<string, Handler>;
  invoke: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  onclose: (fn: Handler) => void;
  onreconnecting: (fn: Handler) => void;
  onreconnected: (fn: Handler) => void;
  resolveStart: () => void;
  push: (name: string, ...args: unknown[]) => void;
  reconnecting: () => void;
  reconnected: () => void;
}

let connections: FakeConnection[] = [];

function makeFakeConnection(): FakeConnection {
  const handlers = new Map<string, Handler>();
  let startResolve: () => void = () => {};
  let onReconnectingHandler: Handler = () => {};
  let onReconnectedHandler: Handler = () => {};
  let onCloseHandler: Handler = () => {};
  const conn: FakeConnection = {
    state: "Disconnected",
    handlers,
    invoke: vi.fn(() => Promise.resolve("server-result")),
    start: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          startResolve = resolve;
        }),
    ),
    stop: vi.fn(() => {
      conn.state = "Disconnected";
      onCloseHandler();
      return Promise.resolve();
    }),
    on: vi.fn((name: string, fn: Handler) => {
      handlers.set(name, fn);
    }),
    off: vi.fn((name: string, fn: Handler) => {
      if (handlers.get(name) === fn) handlers.delete(name);
    }),
    onclose: (fn) => {
      onCloseHandler = fn;
    },
    onreconnecting: (fn) => {
      onReconnectingHandler = fn;
    },
    onreconnected: (fn) => {
      onReconnectedHandler = fn;
    },
    resolveStart: () => {
      conn.state = "Connected";
      startResolve();
    },
    push: (name, ...args) => handlers.get(name)?.(...args),
    reconnecting: () => {
      conn.state = "Reconnecting";
      onReconnectingHandler();
    },
    reconnected: () => {
      conn.state = "Connected";
      onReconnectedHandler();
    },
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
      const conn = makeFakeConnection();
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

beforeEach(() => {
  connections = [];
});

function makeClient(perHub: { lazy?: boolean; graceMs?: number } = {}) {
  return createSignalRClient({
    hubs: {
      [HUB]: {
        ...perHub,
        events: { OnFoo: event<[value: number]>() },
        methods: { Ping: method<[], string>() },
      },
    },
  });
}

type Client = ReturnType<typeof makeClient>;

function mountApp(
  client: Client,
  run: () => void,
  overrides: Partial<SignalRProviderProps> = {},
  show?: Readable<boolean>,
) {
  const providerProps: SignalRProviderProps = {
    baseUrl: BASE_URL,
    accessTokenFactory: () => "token",
    ...overrides,
  };
  return render(ProviderWithChild, {
    props: { provide: client.provideSignalR, providerProps, run, show },
  });
}

describe("svelte integration (real provider, real core session)", () => {
  it("S1: invoke during child init resolves after the connect", async () => {
    const client = makeClient();
    let result: Promise<string> = Promise.resolve("");
    const view = mountApp(client, () => {
      result = client.hubInvoke(HUB, "Ping")();
    });
    await tick();
    expect(connections[0].invoke).not.toHaveBeenCalled();

    connections[0].resolveStart();
    await expect(result).resolves.toBe("server-result");
    expect(connections[0].invoke).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it("S2: an event pushed in the same task as the connect reaches the handler", async () => {
    const client = makeClient();
    const received: number[] = [];
    const view = mountApp(client, () => client.onHubEvent(HUB, "OnFoo", (v) => received.push(v)));
    await tick();

    connections[0].resolveStart();
    connections[0].push("OnFoo", 7);
    expect(received).toEqual([7]);
    view.unmount();
  });

  it("S3: an event pushed right after an auto-reconnect reaches the handler once", async () => {
    const client = makeClient();
    const received: number[] = [];
    const view = mountApp(client, () => client.onHubEvent(HUB, "OnFoo", (v) => received.push(v)));
    await tick();
    connections[0].resolveStart();
    await tick();

    connections[0].reconnecting();
    connections[0].reconnected();
    connections[0].push("OnFoo", 8);
    expect(received).toEqual([8]);
    view.unmount();
  });

  it("S4: a throwing reconnect callback keeps status connected and events flowing", async () => {
    const client = makeClient();
    const received: number[] = [];
    const statuses: string[] = [];
    const onError = vi.fn();
    const view = mountApp(
      client,
      () => {
        client.hubStatus(HUB).subscribe((s) => statuses.push(s));
        client.onReconnected(HUB, () => {
          throw new Error("callback failed");
        });
        client.onHubEvent(HUB, "OnFoo", (v) => received.push(v));
      },
      { onError },
    );
    await tick();
    connections[0].resolveStart();
    await tick();

    connections[0].reconnecting();
    connections[0].reconnected();
    await tick();

    expect(statuses[statuses.length - 1]).toBe("connected");
    expect(onError).toHaveBeenCalledWith(
      HUB,
      expect.objectContaining({ message: "callback failed" }),
      { source: "callback" },
    );
    connections[0].push("OnFoo", 9);
    expect(received).toEqual([9]);
    view.unmount();
  });

  it("S5: equal store emissions do not rebuild", async () => {
    const client = makeClient();
    let emitBaseUrl: (value: string) => void = () => {};
    const baseUrl = {
      subscribe(run: (value: string) => void) {
        emitBaseUrl = run;
        run(BASE_URL);
        return () => {};
      },
    };
    let emitEnabled: (value: boolean) => void = () => {};
    const enabled = {
      subscribe(run: (value: boolean) => void) {
        emitEnabled = run;
        run(true);
        return () => {};
      },
    };
    const view = mountApp(client, () => {}, { baseUrl, enabled });
    await tick();
    connections[0].resolveStart();
    await tick();

    emitBaseUrl(BASE_URL);
    emitEnabled(true);
    await tick();

    expect(connections).toHaveLength(1);
    expect(connections[0].stop).not.toHaveBeenCalled();
    view.unmount();
  });

  it("S6: a connectionKey change rebuilds once, the rebuild runs the reconnect callback, and handlers stay", async () => {
    const client = makeClient();
    const connectionKey = writable("a");
    const received: number[] = [];
    const onReconnected = vi.fn();
    const view = mountApp(
      client,
      () => {
        client.onHubEvent(HUB, "OnFoo", (v) => received.push(v));
        client.onReconnected(HUB, onReconnected);
      },
      { connectionKey },
    );
    await tick();
    connections[0].resolveStart();
    await tick();

    connectionKey.set("b");
    await tick();
    expect(connections).toHaveLength(2);
    connections[1].resolveStart();
    await tick();

    connections[1].push("OnFoo", 10);
    expect(received).toEqual([10]);
    expect(onReconnected).toHaveBeenCalledTimes(1);
    connections[1].reconnecting();
    connections[1].reconnected();
    expect(onReconnected).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it("S7: unmount while an invoke waits rejects with AbortError and sends nothing", async () => {
    const client = makeClient();
    let result: Promise<string> = Promise.resolve("");
    const view = mountApp(client, () => {
      result = client.hubInvoke(HUB, "Ping")();
    });
    await tick();
    const outcome = result.then(
      () => null,
      (err: unknown) => err,
    );

    view.unmount();
    const error = await outcome;
    expect(error).toMatchObject({ name: "AbortError" });
    connections.forEach((c) => expect(c.invoke).not.toHaveBeenCalled());
  });

  it("S7: unmounting only the consumer rejects a waiting invoke and the server gets no invoke", async () => {
    const client = makeClient();
    const show = writable(true);
    let result: Promise<string> = Promise.resolve("");
    const view = mountApp(
      client,
      () => {
        result = client.hubInvoke(HUB, "Ping")();
      },
      {},
      show,
    );
    await tick();
    const outcome = result.then(
      () => null,
      (err: unknown) => err,
    );

    show.set(false);
    await tick();
    connections[0].resolveStart();
    await tick();
    expect(await outcome).toMatchObject({ name: "AbortError" });
    expect(connections[0].invoke).not.toHaveBeenCalled();
    view.unmount();
  });

  it("stops the connection once on provider teardown and builds no new one", async () => {
    const client = makeClient();
    const view = mountApp(client, () => {});
    await tick();
    connections[0].resolveStart();
    await tick();
    expect(connections[0].stop).not.toHaveBeenCalled();

    view.unmount();
    await tick();
    expect(connections).toHaveLength(1);
    expect(connections[0].stop).toHaveBeenCalledTimes(1);
  });

  it("throws the documented error when getSignalR runs outside the provider", () => {
    const client = makeClient();
    expect(() => render(Runner, { props: { run: () => client.getSignalR() } })).toThrow(
      "getSignalR must be called during component init, below provideSignalR",
    );
  });

  it("S8: the first connect goes through connecting to connected", async () => {
    const client = makeClient();
    const statuses: string[] = [];
    const view = mountApp(client, () => {
      client.hubStatus(HUB).subscribe((s) => statuses.push(s));
    });
    await tick();
    connections[0].resolveStart();
    await tick();

    expect(statuses).toEqual(["idle", "connecting", "connected"]);
    view.unmount();
  });

  it("S9: a lazy hub connects with the first consumer and stops after the grace period", async () => {
    const client = makeClient({ lazy: true, graceMs: 40 });
    const show = writable(false);
    const view = mountApp(client, () => client.keepHubAlive(HUB), {}, show);
    await tick();
    expect(connections).toHaveLength(0);

    show.set(true);
    await tick();
    expect(connections).toHaveLength(1);
    connections[0].resolveStart();
    await tick();

    show.set(false);
    await tick();
    expect(connections[0].stop).not.toHaveBeenCalled();
    await tick(80);
    expect(connections[0].stop).toHaveBeenCalled();
    view.unmount();
  });

  it("S10: an event handler stops receiving events after its component unmounts", async () => {
    const client = makeClient();
    const show = writable(true);
    const received: number[] = [];
    const view = mountApp(
      client,
      () => client.onHubEvent(HUB, "OnFoo", (v) => received.push(v)),
      {},
      show,
    );
    await tick();
    connections[0].resolveStart();
    await tick();
    connections[0].push("OnFoo", 1);
    expect(received).toEqual([1]);

    show.set(false);
    await tick();
    connections[0].push("OnFoo", 2);
    expect(received).toEqual([1]);
    view.unmount();
  });
});
