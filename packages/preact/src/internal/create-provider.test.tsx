import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSignalRClient } from "../create-signalr-client.js";
import { event } from "@dammers/use-signalr-core";

function makeConnection() {
  return { on: vi.fn(), off: vi.fn(), start: vi.fn(() => Promise.resolve()), stop: vi.fn(() => Promise.resolve()), onclose: vi.fn(), onreconnecting: vi.fn(), onreconnected: vi.fn(), state: "Disconnected" };
}
let connections: ReturnType<typeof makeConnection>[] = [];
vi.mock("@microsoft/signalr", () => {
  class HubConnectionBuilder {
    withUrl() { return this; }
    configureLogging() { return this; }
    withAutomaticReconnect() { return this; }
    build() { const connection = makeConnection(); connections.push(connection); return connection; }
  }
  return { HubConnectionBuilder, HubConnectionState: { Disconnected: "Disconnected", Connecting: "Connecting", Connected: "Connected", Reconnecting: "Reconnecting" }, LogLevel: { Information: 2 } };
});

const root = document.createElement("div");
const client = createSignalRClient({ hubs: { "/hub": { lazy: true, graceMs: 15, events: { Tick: event<[]>() } } } });
const eagerClient = createSignalRClient({ hubs: { "/hub": { events: { Tick: event<[]>() } } } });

beforeEach(() => { connections = []; });
afterEach(() => { act(() => render(null, root)); });

describe("SignalRProvider", () => {
  it("shares one lazy connection and stops it after the final release", async () => {
    function Consumer() { client.useHubConsumer("/hub"); return null; }
    act(() => render(h(client.SignalRProvider, { baseUrl: "https://example.test", accessTokenFactory: () => "a" }, [h(Consumer, {}), h(Consumer, {})]), root));
    expect(connections).toHaveLength(1);
    act(() => render(h(client.SignalRProvider, { baseUrl: "https://example.test", accessTokenFactory: () => "a" }, h(Consumer, {})), root));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(connections[0]!.stop).not.toHaveBeenCalled();
    act(() => render(h(client.SignalRProvider, { baseUrl: "https://example.test", accessTokenFactory: () => "a" }, null), root));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(connections[0]!.stop).toHaveBeenCalledTimes(1);
  });

  it("does not rebuild for token or callback rerenders", () => {
    const one = vi.fn();
    const two = vi.fn();
    act(() => render(h(eagerClient.SignalRProvider, { baseUrl: "https://example.test", accessTokenFactory: () => "one", onError: one }, null), root));
    act(() => render(h(eagerClient.SignalRProvider, { baseUrl: "https://example.test", accessTokenFactory: () => "two", onError: two }, null), root));
    expect(connections).toHaveLength(1);
    expect(connections[0]!.stop).not.toHaveBeenCalled();
  });

  it("keeps reconnect listeners current and removes them on unmount", () => {
    const first = vi.fn();
    const second = vi.fn();
    function Consumer({ callback }: { callback: () => void }) { eagerClient.useOnReconnected("/hub", callback); return null; }
    act(() => render(h(eagerClient.SignalRProvider, { baseUrl: "https://example.test", accessTokenFactory: () => "a" }, h(Consumer, { callback: first })), root));
    act(() => render(h(eagerClient.SignalRProvider, { baseUrl: "https://example.test", accessTokenFactory: () => "a" }, h(Consumer, { callback: second })), root));
    const reconnect = connections[0]!.onreconnected.mock.calls[0]![0] as () => void;
    reconnect();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    act(() => render(null, root));
    reconnect();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
