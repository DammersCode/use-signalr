import { createContext } from "react";
import type { HubConnection } from "@microsoft/signalr";
import { createSignalRHooks } from "./create-hooks";
import type { SignalRContextValue, SignalRContract } from "../types";

type Hubs = {
  "/hubs/chat": {
    methods: {
      JoinRoomAsync: (id: string) => Promise<void>;
      LeaveRoomAsync: (id: string) => Promise<void>;
    };
  };
};

/** A fake HubConnection that records invoke/send calls and lets a test
 *  resolve the pending invoke by hand. */
export interface FakeConnection {
  connection: HubConnection;
  invokeCalls: Array<{ method: string; args: unknown[] }>;
  sendCalls: Array<{ method: string; args: unknown[] }>;
  /** Resolves the promise returned by the in-flight invoke() call. */
  resolveInvoke: (value?: unknown) => void;
}

function makeFakeConnection(): FakeConnection {
  const invokeCalls: FakeConnection["invokeCalls"] = [];
  const sendCalls: FakeConnection["sendCalls"] = [];
  let resolveInvoke: (value?: unknown) => void = () => {};

  const connection = {
    invoke: (method: string, ...args: unknown[]) => {
      invokeCalls.push({ method, args });
      return new Promise((res) => {
        resolveInvoke = res;
      });
    },
    send: (method: string, ...args: unknown[]) => {
      sendCalls.push({ method, args });
      return Promise.resolve();
    },
  } as unknown as HubConnection;

  return {
    connection,
    invokeCalls,
    sendCalls,
    resolveInvoke: (value?: unknown) => resolveInvoke(value),
  };
}

/** Drives a controllable SignalRContextValue for the hooks under test. */
export interface Harness {
  Provider: (props: { children: React.ReactNode }) => React.JSX.Element;
  hooks: ReturnType<typeof createSignalRHooks<Hubs>>;
  fake: FakeConnection;
  acquireCount: number;
  releaseCount: number;
  /** Flips the hub to "connected", so a pending waitForConnection resolves. */
  connect: () => void;
}

export function makeHarness(opts?: {
  startConnected?: boolean;
  /** Rejects the first waitForConnection, to simulate a transport drop, so
   *  the invoke enters its retry/backoff path. */
  failWaitOnce?: boolean;
}): Harness {
  type Hub = keyof Hubs;
  const Context = createContext<SignalRContextValue<Hubs> | null>(null);
  const hooks = createSignalRHooks<Hubs>(Context);
  const fake = makeFakeConnection();

  let connected = opts?.startConnected ?? false;
  let failWaitsLeft = opts?.failWaitOnce ? 1 : 0;
  const waiters: Array<() => void> = [];

  const harness: Harness = {
    Provider: () => {
      throw new Error("set below");
    },
    hooks,
    fake,
    acquireCount: 0,
    releaseCount: 0,
    connect: () => {
      connected = true;
      waiters.splice(0).forEach((w) => w());
    },
  };

  const value: SignalRContextValue<Hubs> = {
    getConnection: () => (connected ? fake.connection : null),
    isHubConnected: () => connected,
    getStatus: () => (connected ? "connected" : "connecting"),
    statusStore: {
      subscribe: () => () => {},
      get: () => (connected ? "connected" : "connecting"),
      set: () => {},
    } as unknown as SignalRContextValue<Hubs>["statusStore"],
    waitForConnection: (_hub: Hub, timeoutMs: number) => {
      if (failWaitsLeft > 0) {
        failWaitsLeft -= 1;
        return Promise.reject(new Error("transport drop"));
      }
      return new Promise<HubConnection>((resolve, reject) => {
        if (connected) return resolve(fake.connection);
        const t = setTimeout(() => reject(new Error("timeout")), timeoutMs);
        waiters.push(() => {
          clearTimeout(t);
          resolve(fake.connection);
        });
      });
    },
    acquire: () => {
      harness.acquireCount += 1;
    },
    release: () => {
      harness.releaseCount += 1;
    },
    registerReconnect: () => () => {},
  };

  harness.Provider = ({ children }: { children: React.ReactNode }) => (
    <Context value={value}>{children}</Context>
  );

  return harness;
}

export type { SignalRContract };
