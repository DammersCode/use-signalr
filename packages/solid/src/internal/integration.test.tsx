import { createEffect, createSignal, onMount, Show } from "solid-js";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { JSX } from "solid-js";
import { render } from "@solidjs/testing-library";
import { createSignalRClient, event, method } from "../index.js";

const HUB = "/hubs/chat" as const;
const tick = () => new Promise((r) => setTimeout(r, 0));

type Handler = (...args: unknown[]) => void;

function makeFakeConnection() {
  const handlers = new Map<string, Handler[]>();
  const startResolvers: Array<() => void> = [];
  const lifecycle: {
    close?: (err?: unknown) => void;
    reconnecting?: () => void;
    reconnected?: () => void;
  } = {};
  const conn = {
    state: "Disconnected",
    on: vi.fn((name: string, fn: Handler) => {
      handlers.set(name, [...(handlers.get(name) ?? []), fn]);
    }),
    off: vi.fn(),
    start: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          startResolvers.push(() => {
            conn.state = "Connected";
            resolve();
          });
        }),
    ),
    stop: vi.fn(() => {
      conn.state = "Disconnected";
      return Promise.resolve();
    }),
    invoke: vi.fn((..._args: unknown[]) => Promise.resolve("ok")),
    send: vi.fn(() => Promise.resolve()),
    onclose: vi.fn((fn: (err?: unknown) => void) => {
      lifecycle.close = fn;
    }),
    onreconnecting: vi.fn((fn: () => void) => {
      lifecycle.reconnecting = fn;
    }),
    onreconnected: vi.fn((fn: () => void) => {
      lifecycle.reconnected = fn;
    }),
  };
  return {
    conn,
    emit: (name: string, ...args: unknown[]) =>
      handlers.get(name)?.forEach((fn) => fn(...args)),
    finishStart: () => startResolvers.splice(0).forEach((r) => r()),
    reconnect: () => {
      lifecycle.reconnecting?.();
      lifecycle.reconnected?.();
    },
  };
}

type Fake = ReturnType<typeof makeFakeConnection>;
let fakes: Fake[] = [];

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
      const fake = makeFakeConnection();
      fakes.push(fake);
      return fake.conn;
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
  fakes = [];
});

function makeClient(hubOptions: { lazy?: boolean; graceMs?: number } = {}) {
  return createSignalRClient({
    hubs: {
      [HUB]: {
        ...hubOptions,
        events: { Message: event<[text: string]>() },
        methods: { Ping: method<[], string>() },
      },
    },
  });
}

const mountProvider = (
  client: ReturnType<typeof makeClient>,
  children: () => JSX.Element,
  props: { connectionKey?: () => string; onError?: () => void } = {},
) =>
  render(() => (
    <client.SignalRProvider
      baseUrl="https://example.test"
      accessTokenFactory={() => "t"}
      connectionKey={props.connectionKey?.()}
      onError={props.onError}
    >
      {children()}
    </client.SignalRProvider>
  ));

describe("provider values (S5)", () => {
  it("does not rebuild when a new object keeps the same key", async () => {
    const client = makeClient();
    const [user, setUser] = createSignal({ id: "u1", name: "a" });
    const view = render(() => (
      <client.SignalRProvider
        baseUrl="https://example.test"
        accessTokenFactory={() => "t"}
        connectionKey={user().id}
      >
        <div />
      </client.SignalRProvider>
    ));
    await tick();
    expect(fakes).toHaveLength(1);

    setUser({ id: "u1", name: "b" });
    await tick();
    expect(fakes).toHaveLength(1);
    expect(fakes[0].conn.stop).not.toHaveBeenCalled();
    view.unmount();
  });
});

describe("provider values (enabled, baseUrl)", () => {
  it("stops on enabled false and builds again on enabled true", async () => {
    const client = makeClient();
    const [enabled, setEnabled] = createSignal(true);
    const view = render(() => (
      <client.SignalRProvider
        baseUrl="https://example.test"
        accessTokenFactory={() => "t"}
        enabled={enabled()}
      >
        <div />
      </client.SignalRProvider>
    ));
    await tick();
    expect(fakes).toHaveLength(1);

    setEnabled(false);
    await tick();
    expect(fakes[0].conn.stop).toHaveBeenCalledTimes(1);
    expect(fakes).toHaveLength(1);

    setEnabled(true);
    await tick();
    expect(fakes).toHaveLength(2);
    view.unmount();
  });

  it("rebuilds when baseUrl changes", async () => {
    const client = makeClient();
    const [baseUrl, setBaseUrl] = createSignal("https://a.test");
    const view = render(() => (
      <client.SignalRProvider baseUrl={baseUrl()} accessTokenFactory={() => "t"}>
        <div />
      </client.SignalRProvider>
    ));
    await tick();
    expect(fakes).toHaveLength(1);

    setBaseUrl("https://b.test");
    await tick();
    expect(fakes).toHaveLength(2);
    expect(fakes[0].conn.stop).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});

describe("provider disposal", () => {
  it("stops the connection once when the provider unmounts", async () => {
    const client = makeClient();
    const view = mountProvider(client, () => <div />);
    await tick();
    fakes[0].finishStart();
    await tick();
    expect(fakes[0].conn.stop).not.toHaveBeenCalled();

    view.unmount();
    await tick();
    expect(fakes[0].conn.stop).toHaveBeenCalledTimes(1);
  });
});

describe("invoke at the earliest point (S1, S7)", () => {
  it("S1: an invoke from onMount resolves after the connect", async () => {
    const client = makeClient();
    let result: Promise<string> | undefined;
    function Caller() {
      const ping = client.useSignalRInvoke(HUB, "Ping");
      onMount(() => {
        result = ping();
      });
      return null;
    }
    const view = mountProvider(client, () => <Caller />);
    await tick();
    expect(fakes[0].conn.invoke).not.toHaveBeenCalled();

    fakes[0].finishStart();
    await expect(result).resolves.toBe("ok");
    expect(fakes[0].conn.invoke).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it("S7: unmounting the consumer during the wait rejects with AbortError and the server gets no invoke", async () => {
    const client = makeClient();
    const [show, setShow] = createSignal(true);
    let result: Promise<string> | undefined;
    function Caller() {
      const ping = client.useSignalRInvoke(HUB, "Ping");
      onMount(() => {
        result = ping();
      });
      return null;
    }
    const view = mountProvider(client, () => (
      <Show when={show()}>
        <Caller />
      </Show>
    ));
    await tick();
    const outcome = result!.then(
      () => undefined,
      (err: unknown) => err,
    );

    setShow(false);
    await tick();
    fakes[0].finishStart();
    await tick();
    const error = await outcome;
    expect((error as DOMException).name).toBe("AbortError");
    expect(fakes[0].conn.invoke).not.toHaveBeenCalled();
    view.unmount();
  });
});

describe("missing provider", () => {
  it("throws the documented error when a hook runs outside the provider", () => {
    const client = makeClient();
    function Orphan() {
      client.useSignalR();
      return null;
    }
    expect(() => render(() => <Orphan />)).toThrow(
      "useSignalR must be used within a SignalRProvider",
    );
  });
});

describe("events (S2, S3, S4, S6)", () => {
  function mountListener(
    connectionKey?: () => string,
    onReconnect?: () => void,
    onError?: () => void,
  ) {
    const client = makeClient();
    const received: string[] = [];
    const statuses: string[] = [];
    function Listener() {
      client.useSignalREffect(HUB, "Message", (text) => {
        received.push(text);
      });
      if (onReconnect) client.useOnReconnected(HUB, onReconnect);
      const status = client.useHubStatus(HUB);
      createEffect(() => statuses.push(status()));
      return null;
    }
    const view = mountProvider(client, () => <Listener />, {
      connectionKey,
      onError,
    });
    return { view, received, statuses };
  }

  it("S2: an event pushed in the same task as the connect reaches the handler", async () => {
    const { view, received } = mountListener();
    await tick();
    fakes[0].finishStart();
    fakes[0].emit("Message", "early");
    await tick();
    expect(received).toEqual(["early"]);
    view.unmount();
  });

  it("S3: an event pushed right after an auto-reconnect reaches the handler", async () => {
    const { view, received } = mountListener();
    await tick();
    fakes[0].finishStart();
    await tick();
    fakes[0].reconnect();
    fakes[0].emit("Message", "after");
    await tick();
    expect(received).toEqual(["after"]);
    view.unmount();
  });

  it("S4: a throwing reconnect callback keeps the status connected and events flowing", async () => {
    const onError = vi.fn();
    const { view, received, statuses } = mountListener(
      undefined,
      () => {
        throw new Error("boom");
      },
      onError,
    );
    await tick();
    fakes[0].finishStart();
    await tick();
    fakes[0].reconnect();
    await tick();
    expect(statuses.at(-1)).toBe("connected");
    expect(onError).toHaveBeenCalled();
    fakes[0].emit("Message", "still");
    expect(received).toEqual(["still"]);
    view.unmount();
  });

  it("S6: a connectionKey change rebuilds once, the rebuild runs the reconnect callback, and handlers stay", async () => {
    const [key, setKey] = createSignal("k1");
    const onReconnect = vi.fn();
    const { view, received } = mountListener(key, onReconnect);
    await tick();
    fakes[0].finishStart();
    await tick();

    setKey("k2");
    await tick();
    expect(fakes).toHaveLength(2);
    expect(fakes[0].conn.stop).toHaveBeenCalledTimes(1);

    fakes[1].finishStart();
    fakes[1].emit("Message", "new");
    await tick();
    expect(received).toEqual(["new"]);
    expect(onReconnect).toHaveBeenCalledTimes(1);
    fakes[1].reconnect();
    expect(onReconnect).toHaveBeenCalledTimes(2);
    expect(fakes[1].conn.on).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it("stops delivering after the listening component unmounts", async () => {
    const client = makeClient();
    const [show, setShow] = createSignal(true);
    const received: string[] = [];
    function Listener() {
      client.useSignalREffect(HUB, "Message", (text) => {
        received.push(text);
      });
      return null;
    }
    const view = mountProvider(client, () => (
      <Show when={show()}>
        <Listener />
      </Show>
    ));
    await tick();
    fakes[0].finishStart();
    await tick();
    fakes[0].emit("Message", "before");
    setShow(false);
    await tick();
    fakes[0].emit("Message", "after");
    expect(received).toEqual(["before"]);
    view.unmount();
  });
});

describe("status (S8)", () => {
  it("S8: the first connect goes through connecting to connected", async () => {
    const client = makeClient();
    const statuses: string[] = [];
    function Watcher() {
      const status = client.useHubStatus(HUB);
      createEffect(() => statuses.push(status()));
      return null;
    }
    const view = mountProvider(client, () => <Watcher />);
    await tick();
    fakes[0].finishStart();
    await tick();
    const connecting = statuses.indexOf("connecting");
    expect(connecting).toBeGreaterThanOrEqual(0);
    expect(statuses.indexOf("connected")).toBeGreaterThan(connecting);
    view.unmount();
  });
});

describe("lazy hub (S9)", () => {
  it("S9: connects with the first consumer and stops after the last plus graceMs", async () => {
    const client = makeClient({ lazy: true, graceMs: 50 });
    const [show, setShow] = createSignal(false);
    function Consumer() {
      client.useHubConsumer(HUB);
      return null;
    }
    const view = mountProvider(client, () => (
      <Show when={show()}>
        <Consumer />
      </Show>
    ));
    await tick();
    expect(fakes).toHaveLength(0);

    setShow(true);
    await tick();
    expect(fakes).toHaveLength(1);
    fakes[0].finishStart();
    await tick();

    setShow(false);
    await tick();
    expect(fakes[0].conn.stop).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 120));
    expect(fakes[0].conn.stop).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});
