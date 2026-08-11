import { createContext, h, render } from "preact";
import { useEffect } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HubConnectionState } from "@microsoft/signalr";
import type { HubConnection, HubString, SignalRContract } from "@dammers/use-signalr-core";
import { createStatusStore } from "../status-store";
import type { SignalRContextValue } from "../types";
import { createSignalRHooks } from "./create-hooks";

const root = document.createElement("div");
afterEach(() => { act(() => render(null, root)); });

function setup(options?: { connected?: boolean; failWaitOnce?: boolean }) {
  const Context = createContext<SignalRContextValue<SignalRContract> | null>(null);
  const statusStore = createStatusStore<HubString>();
  const acquire = vi.fn();
  const release = vi.fn();
  const on = vi.fn();
  const off = vi.fn();
  const invoke = vi.fn().mockResolvedValue(7);
  const send = vi.fn().mockResolvedValue(undefined);
  let connected = options?.connected ?? true;
  let failedWaits = options?.failWaitOnce ? 1 : 0;
  const waiters: Array<() => void> = [];
  const connection = {
    on,
    off,
    invoke,
    send,
    state: connected ? HubConnectionState.Connected : HubConnectionState.Connecting,
  } as unknown as HubConnection;
  const context = {
    getConnection: () => connected ? connection : null,
    isHubConnected: () => connected,
    getStatus: (hub: HubString) => statusStore.get(hub),
    waitForConnection: (_hub: HubString, timeout: number) => {
      if (failedWaits > 0) {
        failedWaits -= 1;
        return Promise.reject(new Error("transport drop"));
      }
      if (connected) return Promise.resolve(connection);
      return new Promise<HubConnection>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timeout")), timeout);
        waiters.push(() => {
          clearTimeout(timer);
          resolve(connection);
        });
      });
    },
    statusStore,
    acquire,
    release,
    registerReconnect: () => () => {},
  } as unknown as SignalRContextValue<SignalRContract>;
  return {
    Context,
    Hooks: createSignalRHooks<SignalRContract>(Context),
    context,
    statusStore,
    acquire,
    release,
    on,
    off,
    invoke,
    send,
    connect: () => {
      connected = true;
      (connection as unknown as { state: string }).state = HubConnectionState.Connected;
      waiters.splice(0).forEach((wake) => wake());
    },
  };
}

describe("native Preact hooks", () => {
  it("reads provider context and releases lazy consumers", () => {
    const { Context, Hooks, context, acquire, release } = setup();
    function Child() { expect(Hooks.useSignalR()).toBe(context); Hooks.useHubConsumer("/a"); return null; }
    act(() => render(h(Context.Provider, { value: context }, h(Child, {})), root));
    expect(acquire).toHaveBeenCalledWith("/a");
    act(() => render(null, root));
    expect(release).toHaveBeenCalledWith("/a");
  });

  it("updates only the subscribed hub status", () => {
    const { Context, Hooks, context, statusStore } = setup();
    let a = 0;
    let b = 0;
    function A() { a++; Hooks.useHubStatus("/a"); return null; }
    function B() { b++; Hooks.useHubStatus("/b"); return null; }
    act(() => render(h(Context.Provider, { value: context }, [h(A, {}), h(B, {})]), root));
    const beforeA = a;
    act(() => statusStore.set("/b", "connected"));
    expect(a).toBe(beforeA);
    expect(b).toBeGreaterThan(1);
  });

  it("cleans up event listeners and delegates call wrappers", async () => {
    const { Context, Hooks, context, statusStore, on, off, invoke, send } = setup();
    let call: (() => Promise<number>) | undefined;
    let fire: (() => Promise<boolean>) | undefined;
    let teardown: (() => Promise<boolean>) | undefined;
    function Child() {
      Hooks.useSignalREffect("/a", "Tick" as never, () => {});
      call = Hooks.useSignalRInvoke("/a", "Count" as never) as () => Promise<number>;
      fire = Hooks.useSignalRSend("/a", "Count" as never) as () => Promise<boolean>;
      teardown = Hooks.useSignalRTeardown("/a", "Count" as never) as () => Promise<boolean>;
      return null;
    }
    act(() => render(h(Context.Provider, { value: context }, h(Child, {})), root));
    act(() => statusStore.set("/a", "connected"));
    expect(on).toHaveBeenCalledWith("Tick", expect.any(Function));
    await expect(call!()).resolves.toBe(7);
    await expect(fire!()).resolves.toBe(true);
    (context.getConnection("/a") as unknown as { state: string }).state = HubConnectionState.Disconnected;
    await expect(fire!()).resolves.toBe(false);
    await expect(teardown!()).resolves.toBe(true);
    expect(invoke).toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(2);
    act(() => render(null, root));
    expect(off).toHaveBeenCalledWith("Tick", expect.any(Function));
  });

  it("uses the latest event callback without another subscription", () => {
    const { Context, Hooks, context, statusStore, on } = setup();
    const first = vi.fn();
    const second = vi.fn();
    function Child({ handler }: { handler: () => void }) {
      Hooks.useSignalREffect("/a", "Tick" as never, handler);
      return null;
    }
    act(() => render(h(Context.Provider, { value: context }, h(Child, { handler: first })), root));
    act(() => statusStore.set("/a", "connected"));
    const listener = on.mock.calls[0]![1] as () => void;
    act(() => render(h(Context.Provider, { value: context }, h(Child, { handler: second })), root));
    expect(on).toHaveBeenCalledTimes(1);
    listener();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("aborts invoke retries on unmount unless keep-alive is enabled", async () => {
    async function run(keepAliveOnUnmount: boolean) {
      const harness = setup({ failWaitOnce: true });
      let call: (() => Promise<number>) | undefined;
      function Child() {
        call = harness.Hooks.useSignalRInvoke("/a", "Count" as never, {
          retries: 1,
          backoff: [15],
          isRetriable: () => true,
          keepAliveOnUnmount,
        }) as () => Promise<number>;
        return null;
      }
      act(() => render(h(harness.Context.Provider, { value: harness.context }, h(Child, {})), root));
      const result = call!().catch(() => undefined);
      await Promise.resolve();
      act(() => render(null, root));
      await new Promise((resolve) => setTimeout(resolve, 25));
      await result;
      return harness.invoke;
    }

    expect(await run(false)).not.toHaveBeenCalled();
    expect(await run(true)).toHaveBeenCalledTimes(1);
  });

  it("flushes teardown after unmount when a connecting hub becomes ready", async () => {
    const harness = setup({ connected: false });
    function Child() {
      const teardown = harness.Hooks.useSignalRTeardown("/a", "Count" as never);
      useEffect(() => () => { void teardown(); }, [teardown]);
      return null;
    }
    act(() => render(h(harness.Context.Provider, { value: harness.context }, h(Child, {})), root));
    act(() => render(null, root));
    expect(harness.acquire.mock.calls.length).toBeGreaterThan(harness.release.mock.calls.length);
    harness.connect();
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.send).toHaveBeenCalledTimes(1);
    expect(harness.release).toHaveBeenCalledTimes(harness.acquire.mock.calls.length);
  });
});
