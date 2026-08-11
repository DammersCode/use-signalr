import { effectScope, type InjectionKey, type Ref } from "vue";
import type { HubConnection } from "@microsoft/signalr";
import { createComposables } from "./create-composables.js";
import type { SignalRContextValue } from "../types.js";

export type Hubs = {
  "/hubs/chat": { methods: { LeaveRoomAsync: (id: string) => Promise<void> } };
};

export function makeHarness(options?: { connected?: boolean; failWaitOnce?: boolean }) {
  const key: InjectionKey<SignalRContextValue<Hubs>> = Symbol("signalr-test");
  const hooks = createComposables<Hubs>(key);
  const invokeCalls: Array<{ method: string; args: unknown[] }> = [];
  const sendCalls: Array<{ method: string; args: unknown[] }> = [];
  let connected = options?.connected ?? false;
  let failWaits = options?.failWaitOnce ? 1 : 0;
  let resolveInvoke: (value?: unknown) => void = () => {};
  const waiters: Array<() => void> = [];
  const connection = {
    state: connected ? "Connected" : "Connecting",
    invoke: (method: string, ...args: unknown[]) => {
      invokeCalls.push({ method, args });
      return new Promise((resolve) => { resolveInvoke = resolve; });
    },
    send: (method: string, ...args: unknown[]) => {
      sendCalls.push({ method, args });
      return Promise.resolve();
    },
  } as unknown as HubConnection;
  let acquireCount = 0;
  let releaseCount = 0;
  const context: SignalRContextValue<Hubs> = {
    getConnection: () => connected ? connection : null,
    isHubConnected: () => connected,
    getStatus: () => connected ? "connected" : "connecting",
    statusStore: {
      get: () => connected ? "connected" : "connecting",
      set: () => {},
      ref: () => ({ value: connected ? "connected" : "connecting" }) as Ref<"connected" | "connecting">,
    } as unknown as SignalRContextValue<Hubs>["statusStore"],
    waitForConnection: (_hub, timeout) => {
      if (failWaits-- > 0) return Promise.reject(new Error("transport drop"));
      return new Promise<HubConnection>((resolve, reject) => {
        if (connected) return resolve(connection);
        const timer = setTimeout(() => reject(new Error("timeout")), timeout);
        waiters.push(() => { clearTimeout(timer); resolve(connection); });
      });
    },
    acquire: () => { acquireCount += 1; },
    release: () => { releaseCount += 1; },
    registerReconnect: () => () => {},
  };
  return {
    key, hooks, context, connection, invokeCalls, sendCalls,
    get acquireCount() { return acquireCount; },
    get releaseCount() { return releaseCount; },
    resolveInvoke: (value?: unknown) => resolveInvoke(value),
    connect: () => { connected = true; (connection as unknown as { state: string }).state = "Connected"; waiters.splice(0).forEach((wake) => wake()); },
    scope: () => effectScope(),
  };
}
