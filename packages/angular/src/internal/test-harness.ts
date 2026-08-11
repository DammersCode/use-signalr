import {
  EnvironmentInjector,
  InjectionToken,
  createEnvironmentInjector,
  runInInjectionContext,
  signal,
} from "@angular/core";
import { TestBed } from "@angular/core/testing";
import type { Injector } from "@angular/core";
import type { HubConnection } from "@microsoft/signalr";
import { createSignalRHooks } from "./create-hooks.js";
import type { SignalRContract } from "@dammers/use-signalr-core";
import type { SignalRContextValue } from "../types.js";

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
  contextToken: InjectionToken<SignalRContextValue<Hubs>>;
  injector: Injector;
  hooks: ReturnType<typeof createSignalRHooks<Hubs>>;
  fake: FakeConnection;
  acquireCount: number;
  releaseCount: number;
  /** Flips the hub to "connected", so a pending waitForConnection resolves. */
  connect: () => void;
  /** Runs `fn` inside the harness's injection context. */
  run: <R>(fn: () => R) => R;
  /** Destroys the child injector, firing every registered DestroyRef.onDestroy. */
  destroy: () => void;
}

export function makeHarness(opts?: {
  startConnected?: boolean;
  /** Rejects the first waitForConnection, to simulate a transport drop, so
   *  the invoke enters its retry/backoff path. */
  failWaitOnce?: boolean;
}): Harness {
  type Hub = keyof Hubs;
  const contextToken = new InjectionToken<SignalRContextValue<Hubs>>("use-signalr-test");
  const hooks = createSignalRHooks<Hubs>(contextToken);
  const fake = makeFakeConnection();

  let connected = opts?.startConnected ?? false;
  let failWaitsLeft = opts?.failWaitOnce ? 1 : 0;
  const waiters: Array<() => void> = [];
  const statusSignal = signal<"connected" | "connecting">(connected ? "connected" : "connecting");

  const harness: Harness = {
    contextToken,
    injector: null as unknown as Injector,
    hooks,
    fake,
    acquireCount: 0,
    releaseCount: 0,
    connect: () => {
      connected = true;
      statusSignal.set("connected");
      waiters.splice(0).forEach((w) => w());
    },
    run: (fn) => runInInjectionContext(harness.injector, fn),
    destroy: () => (harness.injector as ReturnType<typeof createEnvironmentInjector>).destroy(),
  };

  const value: SignalRContextValue<Hubs> = {
    getConnection: () => (connected ? fake.connection : null),
    isHubConnected: () => connected,
    getStatus: () => (connected ? "connected" : "connecting"),
    statusStore: {
      get: () => statusSignal(),
      set: (_hub, status) => statusSignal.set(status as "connected" | "connecting"),
      signal: () => statusSignal,
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

  const parent = TestBed.inject(EnvironmentInjector);
  harness.injector = createEnvironmentInjector(
    [{ provide: contextToken, useValue: value }],
    parent,
  );

  return harness;
}

export type { SignalRContract };
