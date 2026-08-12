import { createContext, useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";
import { resolveHubConfig } from "@dammers/use-signalr-core";
import { createSignalRProvider } from "./create-provider.js";
import { createSignalRHooks } from "./create-hooks.js";
import type { SignalRContextValue } from "../types.js";

const HUB = "/hubs/chat" as const;
const HUB_B = "/hubs/other" as const;
const tick = () => new Promise((r) => setTimeout(r, 0));

// --- Fake @microsoft/signalr, mirroring packages/solid/src/internal/lifecycle.test.tsx ---
type OnCall = { name: string; fn: (...args: unknown[]) => void };
let onCalls: OnCall[] = [];
let startResolvers: Array<() => void> = [];
let buildCount = 0;
let onCloseHandler: ((err?: unknown) => void) | undefined;
let onReconnectingHandler: (() => void) | undefined;
let onReconnectedHandler: (() => void) | undefined;
let fakeConnection: ReturnType<typeof makeFakeConnection>;

function makeFakeConnection() {
  const conn = {
    on: vi.fn((name: string, fn: (...args: unknown[]) => void) => {
      onCalls.push({ name, fn });
    }),
    off: vi.fn(),
    start: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          startResolvers.push(resolve);
        }),
    ),
    stop: vi.fn(() => {
      conn.state = "Disconnected";
      onCloseHandler?.(undefined);
      return Promise.resolve();
    }),
    onclose: vi.fn((fn: (err?: unknown) => void) => {
      onCloseHandler = fn;
    }),
    onreconnecting: vi.fn((fn: () => void) => {
      onReconnectingHandler = fn;
    }),
    onreconnected: vi.fn((fn: () => void) => {
      onReconnectedHandler = fn;
    }),
    state: "Disconnected",
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
      buildCount += 1;
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
  const LogLevel = { Information: 2 };
  return { HubConnectionBuilder, HubConnectionState, LogLevel };
});

async function resolveStart() {
  fakeConnection.state = "Connected";
  startResolvers.splice(0).forEach((r) => r());
  await act(async () => {
    await tick();
    await tick();
  });
}

function makeClient(hubs: string[] = [HUB]) {
  const Context = createContext<SignalRContextValue<any> | null>(null);
  const resolved = resolveHubConfig({ hubs: {} } as any, {} as any);
  const SignalRProvider = createSignalRProvider<any>(
    Context,
    hubs as any,
    () => resolved,
  );
  const hooks = createSignalRHooks<any>(Context);
  return { SignalRProvider, hooks };
}

beforeEach(() => {
  onCalls = [];
  startResolvers = [];
  buildCount = 0;
  onCloseHandler = undefined;
  onReconnectingHandler = undefined;
  onReconnectedHandler = undefined;
  fakeConnection = makeFakeConnection();
});

describe("shared connection across consumers", () => {
  it("two consumers share one connection; unmounting one does not stop it", async () => {
    const { SignalRProvider, hooks } = makeClient();
    function Consumer() {
      hooks.useHubConsumer(HUB);
      return null;
    }
    function Tree({ showSecond }: { showSecond: boolean }) {
      return (
        <SignalRProvider
          baseUrl="https://example.test"
          accessTokenFactory={() => "token"}
        >
          <Consumer />
          {showSecond ? <Consumer /> : null}
        </SignalRProvider>
      );
    }

    const view = render(<Tree showSecond />);
    await resolveStart();

    expect(buildCount).toBe(1);
    expect(fakeConnection.start).toHaveBeenCalledTimes(1);

    view.rerender(<Tree showSecond={false} />);
    await act(async () => {
      await tick();
      await tick();
    });

    expect(fakeConnection.stop).not.toHaveBeenCalled();
    expect(buildCount).toBe(1);

    view.unmount();
  });
});

describe("useSignalREffect across a reconnect cycle", () => {
  it("keeps exactly one handler attached and detaches on unmount", async () => {
    const { SignalRProvider, hooks } = makeClient();
    function Listener() {
      hooks.useSignalREffect(HUB, "OnFoo", () => {});
      return null;
    }

    const view = render(
      <SignalRProvider
        baseUrl="https://example.test"
        accessTokenFactory={() => "token"}
      >
        <Listener />
      </SignalRProvider>,
    );
    await resolveStart();

    const afterConnect = onCalls.filter((c) => c.name === "OnFoo").length;
    expect(afterConnect).toBe(1);

    await act(async () => {
      onReconnectingHandler?.();
      await tick();
      onReconnectedHandler?.();
      await tick();
      await tick();
    });

    const afterReconnect = onCalls.filter((c) => c.name === "OnFoo").length;
    const offAfterReconnect = fakeConnection.off.mock.calls.filter(
      (c) => c[0] === "OnFoo",
    ).length;

    expect(afterReconnect - afterConnect).toBe(1);
    expect(offAfterReconnect).toBe(1);

    view.unmount();
    await act(async () => {
      await tick();
    });

    const offAfterUnmount = fakeConnection.off.mock.calls.filter(
      (c) => c[0] === "OnFoo",
    ).length;
    expect(offAfterUnmount).toBe(offAfterReconnect + 1);
  });
});

describe("per-hub status isolation", () => {
  it("a status write to hub A does not re-render a hub B observer", async () => {
    const { SignalRProvider, hooks } = makeClient([HUB, HUB_B]);
    let store: SignalRContextValue<any>["statusStore"] | undefined;
    let rendersB = 0;

    function WatcherB() {
      rendersB += 1;
      store = hooks.useSignalR().statusStore;
      hooks.useHubStatus(HUB_B);
      return null;
    }

    const view = render(
      <SignalRProvider
        baseUrl="https://example.test"
        accessTokenFactory={() => "token"}
      >
        <WatcherB />
      </SignalRProvider>,
    );
    await act(async () => {
      await tick();
    });

    const before = rendersB;
    act(() => {
      store!.set(HUB, "connected");
    });
    expect(rendersB).toBe(before);

    act(() => {
      store!.set(HUB_B, "connected");
    });
    expect(rendersB).toBeGreaterThan(before);

    view.unmount();
  });
});

describe("connection rebuild identity", () => {
  it("a new accessTokenFactory closure does not rebuild; a baseUrl change does", async () => {
    const { SignalRProvider, hooks } = makeClient();
    let bumpToken!: () => void;

    function Consumer() {
      hooks.useHubConsumer(HUB);
      return null;
    }
    function Tree({ baseUrl }: { baseUrl: string }) {
      const [n, setN] = useState(0);
      bumpToken = () => setN((v) => v + 1);
      return (
        <SignalRProvider
          baseUrl={baseUrl}
          accessTokenFactory={() => `token-${n}`}
        >
          <Consumer />
        </SignalRProvider>
      );
    }

    const view = render(<Tree baseUrl="https://example.test" />);
    await resolveStart();
    expect(buildCount).toBe(1);

    // A fresh closure each render must not change the connection identity.
    await act(async () => {
      bumpToken();
      await tick();
    });
    expect(buildCount).toBe(1);

    view.rerender(<Tree baseUrl="https://other.test" />);
    await resolveStart();
    expect(buildCount).toBe(2);

    view.unmount();
  });
});
