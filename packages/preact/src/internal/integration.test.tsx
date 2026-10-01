import { h, render } from "preact";
import type { ComponentChildren } from "preact";
import { useEffect } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { event, method } from "@dammers/use-signalr-core";
import { createSignalRClient } from "../create-signalr-client.js";
import type { IHubProtocol } from "@microsoft/signalr";

type Handler = (...args: unknown[]) => void;

function makeConnection() {
  const handlers = new Map<string, Handler[]>();
  const startResolvers: Array<() => void> = [];
  const connection = {
    state: "Disconnected",
    on: vi.fn((name: string, fn: Handler) => { handlers.set(name, [...(handlers.get(name) ?? []), fn]); }),
    off: vi.fn((name: string, fn: Handler) => { handlers.set(name, (handlers.get(name) ?? []).filter((x) => x !== fn)); }),
    start: vi.fn(() => new Promise<void>((resolve) => { startResolvers.push(resolve); })),
    stop: vi.fn(() => { connection.state = "Disconnected"; return Promise.resolve(); }),
    invoke: vi.fn(() => Promise.resolve(42)),
    send: vi.fn(() => Promise.resolve()),
    onclose: vi.fn(),
    onreconnecting: vi.fn(),
    onreconnected: vi.fn(),
    finishStart: () => { connection.state = "Connected"; startResolvers.splice(0).forEach((resolve) => resolve()); },
    push: (name: string, ...args: unknown[]) => { handlers.get(name)?.forEach((fn) => fn(...args)); },
    dropped: () => { (connection.onreconnecting.mock.calls[0]![0] as () => void)(); },
    reconnect: () => { (connection.onreconnected.mock.calls[0]![0] as () => void)(); },
  };
  return connection;
}
let connections: ReturnType<typeof makeConnection>[] = [];
const protocolCalls: unknown[] = [];
vi.mock("@microsoft/signalr", () => {
  class HubConnectionBuilder {
    withUrl() { return this; }
    withHubProtocol(protocol: unknown) { protocolCalls.push(protocol); return this; }
    configureLogging() { return this; }
    withAutomaticReconnect() { return this; }
    build() { const connection = makeConnection(); connections.push(connection); return connection; }
  }
  class HttpError extends Error { constructor(message: string, readonly statusCode: number) { super(message); } }
  const TransferFormat = { Text: 1, Binary: 2 };
  const HttpTransportType = { None: 0, WebSockets: 1, ServerSentEvents: 2, LongPolling: 4 };
  return { HubConnectionBuilder, HttpError, TransferFormat, HttpTransportType, HubConnectionState: { Disconnected: "Disconnected", Connecting: "Connecting", Connected: "Connected", Reconnecting: "Reconnecting" }, LogLevel: { Information: 2 } };
});

const HUB = "/hub";
const client = createSignalRClient({ hubs: { [HUB]: { events: { Tick: event<[n: number]>() }, methods: { Count: method<[], number>() } } } });
const lazyClient = createSignalRClient({ hubs: { [HUB]: { lazy: true, graceMs: 15, events: { Tick: event<[n: number]>() }, methods: { Count: method<[], number>() } } } });
const root = document.createElement("div");
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const connect = (index = 0) => act(async () => { connections[index]!.finishStart(); await Promise.resolve(); await Promise.resolve(); });

interface ProviderOptions {
  children?: ComponentChildren;
  connectionKey?: number;
  onStatusChange?: (hub: string, status: string) => void;
  onError?: (hub: string, error: unknown) => void;
}
function Provider({ children, connectionKey, onStatusChange, onError }: ProviderOptions) {
  return h(client.SignalRProvider, { baseUrl: "https://example.test", accessTokenFactory: () => "t", connectionKey, onStatusChange, onError }, children);
}

beforeEach(() => { connections = []; protocolCalls.length = 0; });
afterEach(() => { act(() => render(null, root)); });

describe("Preact adapter with the real session", () => {
  it("S1: resolves an invoke made in the mount effect after the connect", async () => {
    const results: number[] = [];
    function Caller() {
      const invoke = client.useSignalRInvoke(HUB, "Count");
      useEffect(() => { void invoke().then((value) => results.push(value)); }, [invoke]);
      return null;
    }
    act(() => render(h(Provider, {}, h(Caller, {})), root));
    await flush();
    expect(connections[0]!.invoke).not.toHaveBeenCalled();
    await connect();
    await flush();
    expect(connections[0]!.invoke).toHaveBeenCalledTimes(1);
    expect(results).toEqual([42]);
  });

  it("S2: delivers an event pushed in the same task as the connect", async () => {
    const handler = vi.fn();
    function Listener() { client.useSignalREffect(HUB, "Tick", handler); return null; }
    act(() => render(h(Provider, {}, h(Listener, {})), root));
    await act(async () => { connections[0]!.finishStart(); connections[0]!.push("Tick", 1); await Promise.resolve(); });
    expect(handler).toHaveBeenCalledWith(1);
  });

  it("S3: delivers an event pushed right after an auto-reconnect", async () => {
    const handler = vi.fn();
    function Listener() { client.useSignalREffect(HUB, "Tick", handler); return null; }
    act(() => render(h(Provider, {}, h(Listener, {})), root));
    await connect();
    await act(async () => { connections[0]!.dropped(); await Promise.resolve(); });
    await act(async () => { connections[0]!.reconnect(); connections[0]!.push("Tick", 2); await Promise.resolve(); });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(2);
  });

  it("S4: ends connected and keeps events when a reconnect callback throws", async () => {
    const handler = vi.fn();
    const onError = vi.fn();
    let status = "";
    function Consumer() {
      status = client.useHubStatus(HUB);
      client.useOnReconnected(HUB, () => { throw new Error("boom"); });
      client.useSignalREffect(HUB, "Tick", handler);
      return null;
    }
    act(() => render(h(Provider, { onError }, h(Consumer, {})), root));
    await connect();
    await act(async () => { connections[0]!.dropped(); await Promise.resolve(); });
    expect(status).toBe("reconnecting");
    await act(async () => { connections[0]!.reconnect(); await Promise.resolve(); });
    expect(status).toBe("connected");
    expect(onError).toHaveBeenCalledWith(HUB, expect.any(Error), { source: "callback" });
    act(() => connections[0]!.push("Tick", 3));
    expect(handler).toHaveBeenCalledWith(3);
  });

  it("S5: does not rebuild when an unrelated value changes", async () => {
    function Consumer() { client.useSignalREffect(HUB, "Tick", () => {}); return null; }
    const view = (onError: () => void) => h(Provider, { onError, onStatusChange: () => {} }, h(Consumer, {}));
    act(() => render(view(() => {}), root));
    await connect();
    act(() => render(view(() => {}), root));
    await flush();
    expect(connections).toHaveLength(1);
    expect(connections[0]!.stop).not.toHaveBeenCalled();
  });

  it("S6: a connectionKey change rebuilds once, the rebuild runs the reconnect callback, and handlers stay", async () => {
    const handler = vi.fn();
    const reconnected = vi.fn();
    function Consumer() {
      client.useSignalREffect(HUB, "Tick", handler);
      client.useOnReconnected(HUB, reconnected);
      return null;
    }
    act(() => render(h(Provider, { connectionKey: 1 }, h(Consumer, {})), root));
    await connect(0);
    act(() => render(h(Provider, { connectionKey: 2 }, h(Consumer, {})), root));
    expect(connections).toHaveLength(2);
    await connect(1);
    act(() => connections[1]!.push("Tick", 5));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(5);
    expect(reconnected).toHaveBeenCalledTimes(1);
    act(() => connections[1]!.reconnect());
    expect(reconnected).toHaveBeenCalledTimes(2);
  });

  it("S7: rejects a waiting invoke with AbortError on unmount and sends nothing", async () => {
    let pending: Promise<number> | undefined;
    function Caller() {
      const invoke = client.useSignalRInvoke(HUB, "Count");
      useEffect(() => { pending = invoke(); }, [invoke]);
      return null;
    }
    act(() => render(h(Provider, {}, h(Caller, {})), root));
    const outcome = pending!.catch((error: unknown) => error);
    act(() => render(null, root));
    await expect(outcome).resolves.toMatchObject({ name: "AbortError" });
    connections.forEach((connection) => { connection.finishStart(); expect(connection.invoke).not.toHaveBeenCalled(); });
  });

  it("S7: a consumer unmount rejects a waiting invoke with AbortError and the server gets no invoke", async () => {
    let pending: Promise<number> | undefined;
    function Caller() {
      const invoke = client.useSignalRInvoke(HUB, "Count");
      useEffect(() => { pending = invoke(); }, [invoke]);
      return null;
    }
    act(() => render(h(Provider, {}, h(Caller, {})), root));
    const outcome = pending!.catch((error: unknown) => error);
    act(() => render(h(Provider, {}, null), root));
    await connect();
    await flush();
    await expect(outcome).resolves.toMatchObject({ name: "AbortError" });
    expect(connections[0]!.invoke).not.toHaveBeenCalled();
  });

  it("throws the documented error when a hook runs outside the provider", () => {
    function Orphan() { client.useSignalR(); return null; }
    const fail = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => act(() => render(h(Orphan, {}), root))).toThrow("useSignalR must be used within a SignalRProvider");
    fail.mockRestore();
  });

  it("S8: goes through connecting to connected on the first connect", async () => {
    const seen: string[] = [];
    act(() => render(h(Provider, { onStatusChange: (_hub, status) => seen.push(status) }, null), root));
    await connect();
    expect(seen).toEqual(["connecting", "connected"]);
  });

  it("S9: connects a lazy hub with the first consumer and stops after the last plus graceMs", async () => {
    function Consumer() { lazyClient.useHubConsumer(HUB); return null; }
    const view = (children: ComponentChildren) => h(lazyClient.SignalRProvider, { baseUrl: "https://example.test", accessTokenFactory: () => "t" }, children);
    act(() => render(view(null), root));
    expect(connections).toHaveLength(0);
    act(() => render(view([h(Consumer, {}), h(Consumer, {})]), root));
    expect(connections).toHaveLength(1);
    act(() => render(view(h(Consumer, {})), root));
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(connections[0]!.stop).not.toHaveBeenCalled();
    act(() => render(view(null), root));
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(connections[0]!.stop).toHaveBeenCalledTimes(1);
  });

  it("G3: stops the connection once on provider unmount and builds no new one", async () => {
    act(() => render(h(Provider, {}, null), root));
    await connect();
    act(() => render(null, root));
    await flush();
    expect(connections).toHaveLength(1);
    expect(connections[0]!.stop).toHaveBeenCalledTimes(1);
  });

  it("G3: lets a consumer cleanup send before the provider stops", async () => {
    let sent: Promise<boolean> | undefined;
    function Leaver() {
      const send = client.useSignalRSend(HUB, "Count");
      useEffect(() => () => { sent = send(); }, [send]);
      return null;
    }
    act(() => render(h(Provider, {}, h(Leaver, {})), root));
    await connect();
    act(() => render(null, root));
    await flush();
    await expect(sent).resolves.toBe(true);
    expect(connections).toHaveLength(1);
    expect(connections[0]!.send).toHaveBeenCalledTimes(1);
  });

  it("rejects a waiting invoke with SignalRDisabledError when enabled turns false", async () => {
    let pending: Promise<number> | undefined;
    function Caller() {
      const invoke = client.useSignalRInvoke(HUB, "Count");
      useEffect(() => { pending = invoke(); }, [invoke]);
      return null;
    }
    const view = (enabled: boolean) => h(client.SignalRProvider, { baseUrl: "https://example.test", accessTokenFactory: () => "t", enabled }, h(Caller, {}));
    act(() => render(view(true), root));
    const outcome = pending!.catch((error: unknown) => error);
    act(() => render(view(false), root));
    await flush();
    await expect(outcome).resolves.toMatchObject({ name: "SignalRDisabledError" });
  });

  it("goes idle on enabled false, rebuilds on true, and runs the reconnect callback", async () => {
    const seen: string[] = [];
    const reconnected = vi.fn();
    function Consumer() { client.useOnReconnected(HUB, reconnected); return null; }
    const view = (enabled: boolean) => h(client.SignalRProvider, { baseUrl: "https://example.test", accessTokenFactory: () => "t", enabled, onStatusChange: (_hub: string, status: string) => seen.push(status) }, h(Consumer, {}));
    act(() => render(view(true), root));
    await connect();
    expect(reconnected).not.toHaveBeenCalled();
    act(() => render(view(false), root));
    await flush();
    expect(seen.at(-1)).toBe("idle");
    act(() => render(view(true), root));
    await flush();
    expect(connections).toHaveLength(2);
    await connect(1);
    expect(seen.at(-1)).toBe("connected");
    expect(reconnected).toHaveBeenCalledTimes(1);
  });

  it("rebuilds once when baseUrl changes", async () => {
    const view = (baseUrl: string) => h(client.SignalRProvider, { baseUrl, accessTokenFactory: () => "t" }, null);
    act(() => render(view("https://a.test"), root));
    await connect();
    act(() => render(view("https://b.test"), root));
    await flush();
    expect(connections).toHaveLength(2);
    expect(connections[0]!.stop).toHaveBeenCalledTimes(1);
  });

  it("S10: runs onReconnected once when a recovery rebuild connects again", async () => {
    const reconnected = vi.fn();
    function Rejoin() { client.useOnReconnected(HUB, reconnected); return null; }
    act(() => render(h(Provider, {}, h(Rejoin, {})), root));
    await connect();
    expect(reconnected).not.toHaveBeenCalled();
    vi.useFakeTimers();
    try {
      await act(async () => {
        connections[0]!.onreconnecting.mock.calls[0]![0]();
        (connections[0]!.onclose.mock.calls[0]![0] as (error?: Error) => void)(new Error("server gone"));
        await vi.advanceTimersByTimeAsync(2500);
      });
      expect(connections).toHaveLength(2);
      await act(async () => { connections[1]!.finishStart(); await vi.advanceTimersByTimeAsync(0); });
    } finally { vi.useRealTimers(); }
    expect(reconnected).toHaveBeenCalledTimes(1);
  });

  it("passes hubProtocol and configureBuilder from the client config to the build", async () => {
    const protocol: IHubProtocol = { name: "fake", version: 1, transferFormat: 1, parseMessages: () => [], writeMessage: () => "" };
    const contexts: Array<{ hub: string; baseUrl: string }> = [];
    const custom = createSignalRClient({ hubs: { [HUB]: {} }, hubProtocol: () => protocol, configureBuilder: (builder, ctx) => { contexts.push(ctx); return builder; } });
    act(() => render(h(custom.SignalRProvider, { baseUrl: "https://example.test", accessTokenFactory: () => "t" }, null), root));
    await flush();
    expect(connections).toHaveLength(1);
    expect(protocolCalls).toEqual([protocol]);
    expect(contexts).toEqual([{ hub: HUB, baseUrl: "https://example.test" }]);
  });

  it("lets a lazy hub finish a keepAliveOnUnmount invoke after its caller unmounts", async () => {
    const results: number[] = [];
    function Caller() {
      const invoke = lazyClient.useSignalRInvoke(HUB, "Count", { keepAliveOnUnmount: true });
      useEffect(() => { void invoke().then((value) => results.push(value)); }, [invoke]);
      return null;
    }
    const view = (children: ComponentChildren) => h(lazyClient.SignalRProvider, { baseUrl: "https://example.test", accessTokenFactory: () => "t" }, children);
    act(() => render(view(h(Caller, {})), root));
    act(() => render(view(null), root));
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(connections[0]!.stop).not.toHaveBeenCalled();
    await connect();
    await flush();
    expect(results).toEqual([42]);
  });

  it("calls the latest handler without a second subscription", async () => {
    const first = vi.fn();
    const second = vi.fn();
    function Listener({ handler }: { handler: (n: number) => void }) { client.useSignalREffect(HUB, "Tick", handler); return null; }
    act(() => render(h(Provider, {}, h(Listener, { handler: first })), root));
    await connect();
    act(() => render(h(Provider, {}, h(Listener, { handler: second })), root));
    act(() => connections[0]!.push("Tick", 1));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(1);
  });

  it("does not re-render a useSignalREffect consumer on a status change", async () => {
    let renders = 0;
    function Listener() { renders++; client.useSignalREffect(HUB, "Tick", () => {}); return null; }
    act(() => render(h(Provider, {}, h(Listener, {})), root));
    const before = renders;
    await connect();
    expect(renders).toBe(before);
  });
});
