import type { HubConnection } from "@microsoft/signalr";
import { createSignalRHooks } from "./create-hooks";
import type { SignalRContract } from "@dammers/use-signalr-core";
import type { SignalRContextValue } from "../types";

export type Hubs = {
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
  contextKey: symbol;
  context: Map<symbol, SignalRContextValue<Hubs>>;
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
  const contextKey = Symbol("use-signalr-test");
  const hooks = createSignalRHooks<Hubs>(contextKey);
  const fake = makeFakeConnection();

  let connected = opts?.startConnected ?? false;
  let failWaitsLeft = opts?.failWaitOnce ? 1 : 0;
  const waiters: Array<() => void> = [];

  const harness: Harness = {
    contextKey,
    context: new Map(),
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
      get: () => (connected ? "connected" : "connecting"),
      set: () => {},
      readable: () => ({ subscribe: () => () => {} }),
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

  harness.context = new Map([[contextKey, value]]);

  return harness;
}

export type { SignalRContract };
