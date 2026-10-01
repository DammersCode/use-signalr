import { StrictMode, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";
import { TransferFormat } from "@microsoft/signalr";
import type { IHubProtocol } from "@microsoft/signalr";
import { createSignalRClient, event, method } from "../index.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

type Handler = (...args: unknown[]) => void;

interface FakeConn {
  handlers: Map<string, Handler[]>;
  startResolvers: Array<() => void>;
  invokeCalls: string[];
  lifecycle: {
    onclose?: (err?: unknown) => void;
    onreconnecting?: () => void;
    onreconnected?: () => void;
  };
  state: string;
  start: () => Promise<void>;
  stop: ReturnType<typeof vi.fn>;
  invoke: (name: string) => Promise<string>;
  on: (name: string, fn: Handler) => void;
  off: () => void;
  onclose: (fn: () => void) => void;
  onreconnecting: (fn: () => void) => void;
  onreconnected: (fn: () => void) => void;
}

let conns: FakeConn[] = [];
const protocolCalls: unknown[] = [];

function makeConn(): FakeConn {
  const conn: FakeConn = {
    handlers: new Map(),
    startResolvers: [],
    invokeCalls: [],
    lifecycle: {},
    state: "Disconnected",
    start: () =>
      new Promise<void>((resolve) => {
        conn.startResolvers.push(() => {
          conn.state = "Connected";
          resolve();
        });
      }),
    stop: vi.fn(() => {
      conn.state = "Disconnected";
      return Promise.resolve();
    }),
    invoke: (name) => {
      conn.invokeCalls.push(name);
      return Promise.resolve("ok");
    },
    on: (name, fn) => {
      conn.handlers.set(name, [...(conn.handlers.get(name) ?? []), fn]);
    },
    off: () => {},
    onclose: (fn) => {
      conn.lifecycle.onclose = fn;
    },
    onreconnecting: (fn) => {
      conn.lifecycle.onreconnecting = fn;
    },
    onreconnected: (fn) => {
      conn.lifecycle.onreconnected = fn;
    },
  };
  return conn;
}

vi.mock("@microsoft/signalr", () => {
  class HubConnectionBuilder {
    withUrl() {
      return this;
    }
    withHubProtocol(protocol: unknown) {
      protocolCalls.push(protocol);
      return this;
    }
    configureLogging() {
      return this;
    }
    withAutomaticReconnect() {
      return this;
    }
    build() {
      const conn = makeConn();
      conns.push(conn);
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
  const TransferFormat = { Text: 1, Binary: 2 };
  const HttpTransportType = { None: 0, WebSockets: 1, ServerSentEvents: 2, LongPolling: 4 };
  return { HubConnectionBuilder, HubConnectionState, HttpError, LogLevel: { Information: 2 }, TransferFormat, HttpTransportType };
});

const HUB = "/hubs/chat" as const;
const LAZY = "/hubs/lazy" as const;
const config = {
  hubs: {
    [HUB]: {
      events: { Message: event<[text: string]>() },
      methods: { Join: method<[], string>() },
    },
    [LAZY]: { lazy: true, graceMs: 150, events: { Ping: event<[]>() }, methods: { Join: method<[], string>() } },
  },
} as const;

beforeEach(() => {
  conns = [];
  protocolCalls.length = 0;
});

const hubConns = () => conns.filter((c) => c.handlers.has("Message"));
const liveChat = () => hubConns()[hubConns().length - 1]!;

async function settle() {
  await act(async () => {
    await tick();
    await tick();
  });
}

async function connect(conn: FakeConn) {
  await act(async () => {
    conn.startResolvers.splice(0).forEach((r) => r());
    await tick();
    await tick();
  });
}

function emit(conn: FakeConn, name: string, ...args: unknown[]) {
  conn.handlers.get(name)?.forEach((fn) => fn(...args));
}

function setup() {
  const client = createSignalRClient(config);
  const Provider = (props: {
    children: ReactNode;
    connectionKey?: string;
    accessToken?: string;
    onError?: (hub: string, err: unknown, info: { source: string }) => void;
    onStatusChange?: (hub: string, status: string) => void;
  }) => (
    <client.SignalRProvider
      baseUrl="https://example.test"
      accessTokenFactory={() => props.accessToken ?? "token"}
      connectionKey={props.connectionKey}
      onError={props.onError}
      onStatusChange={props.onStatusChange}
    >
      {props.children}
    </client.SignalRProvider>
  );
  return { client, Provider };
}

type Client = ReturnType<typeof setup>["client"];

function Listener({ client, received }: { client: Client; received: string[] }) {
  client.useSignalREffect(HUB, "Message", (text) => received.push(text));
  return null;
}

describe.each([
  ["plain", (children: ReactNode) => children],
  ["StrictMode", (children: ReactNode) => <StrictMode>{children}</StrictMode>],
])("S1 invoke from the mount effect (%s)", (_name, wrap) => {
  it("resolves after the connect", async () => {
    const { client, Provider } = setup();
    const results: string[] = [];
    function Caller() {
      const join = client.useSignalRInvoke(HUB, "Join");
      useEffect(() => {
        join().then((r) => results.push(r), () => {});
      }, [join]);
      return null;
    }
    render(
      wrap(
        <Provider>
          <Caller />
        </Provider>,
      ),
    );
    await settle();
    expect(results).toEqual([]);
    await connect(liveChat());
    expect(results).toContain("ok");
    expect(liveChat().invokeCalls).toEqual(["Join"]);
  });
});

describe("events through the registry", () => {
  it("S2 delivers an event pushed in the same task as the connect", async () => {
    const { client, Provider } = setup();
    const received: string[] = [];
    render(
      <Provider>
        <Listener client={client} received={received} />
      </Provider>,
    );
    await settle();
    await act(async () => {
      liveChat().startResolvers.splice(0).forEach((r) => r());
      emit(liveChat(), "Message", "early");
      await tick();
    });
    expect(received).toEqual(["early"]);
  });

  it("S3 delivers an event pushed right after an auto-reconnect", async () => {
    const { client, Provider } = setup();
    const received: string[] = [];
    render(
      <Provider>
        <Listener client={client} received={received} />
      </Provider>,
    );
    await settle();
    await connect(liveChat());
    await act(async () => {
      liveChat().lifecycle.onreconnecting?.();
      await tick();
      liveChat().lifecycle.onreconnected?.();
      emit(liveChat(), "Message", "after");
      await tick();
    });
    expect(received).toEqual(["after"]);
  });

  it("S4 ends connected and keeps events when a reconnect callback throws", async () => {
    const { client, Provider } = setup();
    const received: string[] = [];
    const onError = vi.fn();
    function Both() {
      client.useOnReconnected(HUB, () => {
        throw new Error("boom");
      });
      return <Listener client={client} received={received} />;
    }
    function Status() {
      return <span data-testid="s">{client.useHubStatus(HUB)}</span>;
    }
    const view = render(
      <Provider onError={onError}>
        <Both />
        <Status />
      </Provider>,
    );
    await settle();
    await connect(liveChat());
    await act(async () => {
      liveChat().lifecycle.onreconnecting?.();
      await tick();
      liveChat().lifecycle.onreconnected?.();
      await tick();
    });
    expect(view.getByTestId("s").textContent).toBe("connected");
    expect(onError).toHaveBeenCalled();
    emit(liveChat(), "Message", "still");
    expect(received).toEqual(["still"]);
  });

  it("S10 runs onReconnected once when a recovery rebuild connects again", async () => {
    const { client, Provider } = setup();
    const onReconnected = vi.fn();
    function Rejoin() {
      client.useOnReconnected(HUB, onReconnected);
      return null;
    }
    render(
      <Provider>
        <Rejoin />
      </Provider>,
    );
    await settle();
    await connect(liveChat());
    expect(onReconnected).not.toHaveBeenCalled();

    vi.useFakeTimers();
    try {
      await act(async () => {
        liveChat().lifecycle.onreconnecting?.();
        liveChat().lifecycle.onclose?.(new Error("server gone"));
        await vi.advanceTimersByTimeAsync(2500);
      });
      expect(hubConns()).toHaveLength(2);
      await act(async () => {
        liveChat().startResolvers.splice(0).forEach((r) => r());
        await vi.advanceTimersByTimeAsync(0);
      });
    } finally {
      vi.useRealTimers();
    }

    expect(onReconnected).toHaveBeenCalledTimes(1);
  });

  it("S11 passes the error source to onError", async () => {
    const { client, Provider } = setup();
    const onError = vi.fn();
    function Bad() {
      client.useSignalREffect(HUB, "Message", () => {
        throw new Error("handler bug");
      });
      return null;
    }
    render(
      <Provider onError={onError}>
        <Bad />
      </Provider>,
    );
    await settle();
    await connect(liveChat());
    emit(liveChat(), "Message", "x");
    expect(onError).toHaveBeenCalledWith(HUB, expect.any(Error), { source: "callback" });
  });

  it("S6 a connectionKey change rebuilds once, the rebuild runs the reconnect callback, and handlers stay", async () => {
    const { client, Provider } = setup();
    const received: string[] = [];
    let reconnects = 0;
    function Both() {
      client.useOnReconnected(HUB, () => {
        reconnects += 1;
      });
      return <Listener client={client} received={received} />;
    }
    const tree = (key: string) => (
      <Provider connectionKey={key}>
        <Both />
      </Provider>
    );
    const view = render(tree("a"));
    await settle();
    await connect(liveChat());
    expect(hubConns()).toHaveLength(1);

    view.rerender(tree("b"));
    await settle();
    expect(hubConns()).toHaveLength(2);
    await connect(liveChat());
    emit(liveChat(), "Message", "new");
    expect(reconnects).toBe(1);
    await act(async () => {
      liveChat().lifecycle.onreconnected?.();
      await tick();
    });
    expect(received).toEqual(["new"]);
    expect(reconnects).toBe(2);
  });
});

describe("unsubscribe on unmount", () => {
  it("stops delivering events after the listener unmounts", async () => {
    const { client, Provider } = setup();
    const received: string[] = [];
    const view = render(
      <Provider>
        <Listener client={client} received={received} />
      </Provider>,
    );
    await settle();
    await connect(liveChat());
    view.rerender(
      <Provider>
        <span />
      </Provider>,
    );
    await settle();
    emit(liveChat(), "Message", "late");
    expect(received).toEqual([]);
  });
});

describe("G3 provider unmount", () => {
  it("stops the connection once and builds no new one", async () => {
    const { Provider } = setup();
    const view = render(
      <Provider>
        <span />
      </Provider>,
    );
    await settle();
    await connect(liveChat());
    view.unmount();
    await settle();
    expect(conns).toHaveLength(1);
    expect(conns[0]!.stop).toHaveBeenCalledTimes(1);
  });
});

describe("B7 provider effect under StrictMode", () => {
  const strict = (node: ReactNode) => <StrictMode>{node}</StrictMode>;

  it("builds each hub once and does not stop before unmount", async () => {
    const { Provider } = setup();
    const view = render(
      strict(
        <Provider>
          <span />
        </Provider>,
      ),
    );
    await settle();
    expect(conns).toHaveLength(1);
    expect(conns[0]!.stop).not.toHaveBeenCalled();
    view.unmount();
    await settle();
    expect(conns[0]!.stop).toHaveBeenCalledTimes(1);
    expect(conns).toHaveLength(1);
  });

  it("rebuilds exactly once when connectionKey changes", async () => {
    const { Provider } = setup();
    const view = render(
      strict(
        <Provider connectionKey="a">
          <span />
        </Provider>,
      ),
    );
    await settle();
    view.rerender(
      strict(
        <Provider connectionKey="b">
          <span />
        </Provider>,
      ),
    );
    await settle();
    expect(conns).toHaveLength(2);
    expect(conns[0]!.stop).toHaveBeenCalledTimes(1);
    expect(conns[1]!.stop).not.toHaveBeenCalled();
  });
});

describe("S5 rebuild identity", () => {
  it("does not rebuild when an unrelated value changes", async () => {
    const { Provider } = setup();
    let bump!: () => void;
    function Tree() {
      const [n, setN] = useState(0);
      bump = () => setN((v) => v + 1);
      return (
        <Provider accessToken={`t${n}`}>
          <span>{n}</span>
        </Provider>
      );
    }
    render(<Tree />);
    await settle();
    const before = conns.length;
    act(() => bump());
    act(() => bump());
    await settle();
    expect(conns.length).toBe(before);
    expect(conns.every((c) => c.stop.mock.calls.length === 0)).toBe(true);
  });
});

describe("S7 unmount while an invoke waits", () => {
  it("rejects with AbortError and sends no invoke", async () => {
    const { client, Provider } = setup();
    let failure: unknown;
    function Caller() {
      const join = client.useSignalRInvoke(HUB, "Join");
      useEffect(() => {
        join().catch((err: unknown) => {
          failure = err;
        });
      }, [join]);
      return null;
    }
    const view = render(
      <Provider>
        <Caller />
      </Provider>,
    );
    await settle();
    view.rerender(
      <Provider>
        <span />
      </Provider>,
    );
    await settle();
    await connect(liveChat());
    expect(failure).toMatchObject({ name: "AbortError" });
    expect(conns.flatMap((c) => c.invokeCalls)).toEqual([]);
  });
});

describe("missing provider", () => {
  it("throws the documented error when a hook runs outside the provider", () => {
    const { client } = setup();
    function Orphan() {
      client.useSignalR();
      return null;
    }
    const silence = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Orphan />)).toThrow("useSignalR must be used within a SignalRProvider");
    silence.mockRestore();
  });
});

describe("S8 first connect status", () => {
  it("goes through connecting to connected", async () => {
    const { client, Provider } = setup();
    const seen: string[] = [];
    function Status() {
      seen.push(client.useHubStatus(HUB));
      return null;
    }
    const onStatusChange = vi.fn();
    render(
      <Provider onStatusChange={onStatusChange}>
        <Status />
      </Provider>,
    );
    await settle();
    await connect(liveChat());
    expect([...new Set(seen)]).toEqual(["idle", "connecting", "connected"]);
    const published = onStatusChange.mock.calls
      .filter(([hub]) => hub === HUB)
      .map(([, status]) => status);
    expect(published).toEqual(["connecting", "connected"]);
  });
});

describe("S9 lazy hub", () => {
  it("connects with the first consumer and stops after the grace period", async () => {
    const { client, Provider } = setup();
    function Consumer() {
      client.useHubConsumer(LAZY);
      return null;
    }
    const lazyConns = () => conns.filter((c) => c.handlers.has("Ping"));
    const view = render(
      <Provider>
        <span />
      </Provider>,
    );
    await settle();
    expect(lazyConns()).toHaveLength(0);

    view.rerender(
      <Provider>
        <Consumer />
      </Provider>,
    );
    await settle();
    expect(lazyConns()).toHaveLength(1);
    const lazyConn = lazyConns()[0]!;
    await connect(lazyConn);

    view.rerender(
      <Provider>
        <span />
      </Provider>,
    );
    await settle();
    expect(lazyConn.stop).not.toHaveBeenCalled();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(lazyConn.stop).toHaveBeenCalledTimes(1);
  });
});

describe("enabled and baseUrl", () => {
  const hubView = (client: Client, props: { enabled?: boolean; baseUrl?: string }, children: ReactNode) => (
    <client.SignalRProvider baseUrl={props.baseUrl ?? "https://example.test"} accessTokenFactory={() => "token"} enabled={props.enabled}>
      {children}
    </client.SignalRProvider>
  );

  it("rejects a waiting invoke with SignalRDisabledError when enabled turns false", async () => {
    const { client } = setup();
    let failure: unknown;
    function Caller() {
      const join = client.useSignalRInvoke(HUB, "Join");
      useEffect(() => {
        join().catch((err: unknown) => {
          failure = err;
        });
      }, [join]);
      return null;
    }
    const view = render(hubView(client, { enabled: true }, <Caller />));
    await settle();
    view.rerender(hubView(client, { enabled: false }, <Caller />));
    await settle();
    expect(failure).toMatchObject({ name: "SignalRDisabledError" });
  });

  it("goes idle on enabled false, rebuilds on true, and runs the reconnect callback", async () => {
    const { client } = setup();
    const reconnected = vi.fn();
    function Consumer() {
      client.useOnReconnected(HUB, reconnected);
      return <span>{client.useHubStatus(HUB)}</span>;
    }
    const view = render(hubView(client, { enabled: true }, <Consumer />));
    await settle();
    await connect(liveChat());
    expect(view.container.textContent).toBe("connected");
    view.rerender(hubView(client, { enabled: false }, <Consumer />));
    await settle();
    expect(view.container.textContent).toBe("idle");
    view.rerender(hubView(client, { enabled: true }, <Consumer />));
    await settle();
    expect(hubConns()).toHaveLength(2);
    await connect(liveChat());
    expect(view.container.textContent).toBe("connected");
    expect(reconnected).toHaveBeenCalledTimes(1);
  });

  it("rebuilds once when baseUrl changes", async () => {
    const { client } = setup();
    const view = render(hubView(client, { baseUrl: "https://a.test" }, <span />));
    await settle();
    await connect(liveChat());
    view.rerender(hubView(client, { baseUrl: "https://b.test" }, <span />));
    await settle();
    expect(hubConns()).toHaveLength(2);
    expect(hubConns()[0]!.stop).toHaveBeenCalledTimes(1);
  });
});

describe("keepAliveOnUnmount on a lazy hub", () => {
  it("finishes the call after the caller unmounts while the hub connects", async () => {
    const { client, Provider } = setup();
    const results: string[] = [];
    function Caller() {
      const join = client.useSignalRInvoke(LAZY, "Join", { keepAliveOnUnmount: true });
      useEffect(() => {
        join().then((r) => results.push(r), () => {});
      }, [join]);
      return null;
    }
    const lazyConns = () => conns.filter((c) => c.handlers.has("Ping"));
    const view = render(
      <Provider>
        <Caller />
      </Provider>,
    );
    await settle();
    view.rerender(
      <Provider>
        <span />
      </Provider>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(lazyConns()[0]!.stop).not.toHaveBeenCalled();
    await connect(lazyConns()[0]!);
    expect(results).toEqual(["ok"]);
  });
});

describe("hubProtocol and configureBuilder", () => {
  it("pass from the client config to the connection build", async () => {
    const protocol: IHubProtocol = {
      name: "fake",
      version: 1,
      transferFormat: TransferFormat.Text,
      parseMessages: () => [],
      writeMessage: () => "",
    };
    const contexts: Array<{ hub: string; baseUrl: string }> = [];
    const client = createSignalRClient({
      hubs: { [HUB]: { events: { Message: event<[text: string]>() } } },
      hubProtocol: () => protocol,
      configureBuilder: (builder, ctx) => {
        contexts.push(ctx);
        return builder;
      },
    });
    render(
      <client.SignalRProvider baseUrl="https://example.test" accessTokenFactory={() => "token"}>
        <span />
      </client.SignalRProvider>,
    );
    await settle();
    expect(conns).toHaveLength(1);
    expect(protocolCalls).toEqual([protocol]);
    expect(contexts).toEqual([{ hub: HUB, baseUrl: "https://example.test" }]);
  });
});
