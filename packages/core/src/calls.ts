import { HubConnectionState } from "@microsoft/signalr";
import {
  DEFAULT_BACKOFF,
  InvokeError,
  isRetriableInvokeError,
  resolveBackoff,
  sleep,
} from "./retry";
import type { HubConnection } from "@microsoft/signalr";
import type {
  HubString,
  InvokeOptions,
  TeardownOptions,
  MethodArgs,
  MethodName,
  MethodReturn,
  SignalRContract,
} from "./types";

const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_TEARDOWN_TIMEOUT = 10_000;

export interface CallTarget<T extends SignalRContract> {
  waitForConnection: (
    hub: keyof T & HubString,
    timeoutMs: number,
  ) => Promise<HubConnection>;
  getConnection: (hub: keyof T & HubString) => HubConnection | null;
}

/**
 * Builds the stable invoke function for `useSignalRInvoke`. `getOptions` is
 * called at CALL time (not build time), so the adapter can pass a ref/latest
 * accessor and preserve latest-options semantics. `setAbort` is called once
 * per invocation with the new controller, so the adapter's unmount/cleanup
 * handler can abort the in-flight call.
 */
export function createInvoker<
  T extends SignalRContract,
  H extends keyof T & HubString,
  M extends MethodName<T, H>,
>(
  target: CallTarget<T>,
  hub: H,
  method: M,
  getOptions: () => InvokeOptions | undefined,
  setAbort: (ac: AbortController) => void,
): (...args: MethodArgs<T, H, M>) => Promise<MethodReturn<T, H, M>> {
  const { waitForConnection, getConnection } = target;
  return async (...args: MethodArgs<T, H, M>): Promise<MethodReturn<T, H, M>> => {
    const o = getOptions();
    const timeout = o?.timeout ?? DEFAULT_TIMEOUT;
    const retries = o?.retries ?? 0;
    const ac = new AbortController();
    setAbort(ac);
    let attempt = 0;
    for (;;) {
      try {
        const connection = await waitForConnection(hub, timeout);
        return await connection.invoke<MethodReturn<T, H, M>>(method, ...args);
      } catch (error) {
        const conn = getConnection(hub);
        const forced = o?.isRetriable?.(error);
        const retriable =
          forced ?? (conn ? isRetriableInvokeError(error, conn) : true);
        if (!retriable || attempt >= retries) {
          // No retries: rethrow the raw error, so callers see the original.
          if (retries === 0) throw error;
          throw new InvokeError(
            `SignalR invoke ${hub}/${String(method)} failed after ${attempt + 1} attempts`,
            error,
            attempt + 1,
            retriable,
          );
        }
        await sleep(resolveBackoff(o?.backoff ?? DEFAULT_BACKOFF, attempt), ac.signal);
        attempt += 1;
      }
    }
  };
}

/**
 * Builds the stable fire-and-forget sender for `useSignalRSend`. Reads the
 * connection at call time and never depends on the adapter's tracked state,
 * so it is safe to capture in a teardown handler.
 */
export function createSender<
  T extends SignalRContract,
  H extends keyof T & HubString,
  M extends MethodName<T, H>,
>(
  getConnection: (hub: H) => HubConnection | null,
  hub: H,
  method: M,
): (...args: MethodArgs<T, H, M>) => Promise<boolean> {
  return (...args: MethodArgs<T, H, M>): Promise<boolean> => {
    const connection = getConnection(hub);
    if (!connection || connection.state !== HubConnectionState.Connected) {
      return Promise.resolve(false); // dropped: not connected
    }
    // send() is variadic and untyped; args are enforced at the call site.
    return connection.send(method, ...(args as unknown[])).then(() => true);
  };
}

/**
 * Builds the stable RELIABLE teardown sender for `useSignalRTeardown`. Runs
 * detached from the caller's lifecycle: it acquires the hub itself, waits
 * for a connection, sends, then releases — independent of the consumer
 * that created it having already torn down.
 */
export function createTeardownSender<
  T extends SignalRContract,
  H extends keyof T & HubString,
  M extends MethodName<T, H>,
>(
  deps: {
    acquire: (hub: H) => void;
    release: (hub: H) => void;
    waitForConnection: (hub: H, timeoutMs: number) => Promise<HubConnection>;
  },
  hub: H,
  method: M,
  getOptions: () => TeardownOptions | undefined,
): (...args: MethodArgs<T, H, M>) => Promise<boolean> {
  const { acquire, release, waitForConnection } = deps;
  return (...args: MethodArgs<T, H, M>): Promise<boolean> => {
    const timeout = getOptions()?.timeout ?? DEFAULT_TEARDOWN_TIMEOUT;
    acquire(hub); // hold the hub open past our own unmount, until flushed
    return (async () => {
      try {
        const connection = await waitForConnection(hub, timeout);
        await connection.send(method, ...(args as unknown[]));
        return true;
      } catch {
        return false; // never connected in time, or the send failed: best-effort
      } finally {
        release(hub);
      }
    })();
  };
}
