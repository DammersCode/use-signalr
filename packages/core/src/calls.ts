import { HubConnectionState } from "@microsoft/signalr";
import { isFinalWaitError } from "./errors.js";
import {
  DEFAULT_BACKOFF,
  isRetriableInvokeError,
  resolveBackoff,
  sleep,
} from "./retry.js";
import type { HubConnection } from "@microsoft/signalr";
import type {
  HubString,
  InvokeOptions,
  TeardownOptions,
  MethodArgs,
  MethodName,
  MethodReturn,
  SignalRContract,
} from "./types.js";

const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_TEARDOWN_TIMEOUT = 10_000;

/** One shared signal for all in-flight calls of a consumer. `abort` cancels them and starts a fresh signal. */
export interface AbortScope {
  /** Returns the current signal. Pass it as `getSignal`. */
  signal: () => AbortSignal;
  /** Aborts the current signal with an `AbortError`, and starts a fresh signal. */
  abort: () => void;
}

export function createAbortScope(): AbortScope {
  let controller = new AbortController();
  return {
    signal: () => controller.signal,
    abort: () => {
      const stale = controller;
      controller = new AbortController();
      stale.abort(new DOMException("The consumer unmounted, so the call was aborted.", "AbortError"));
    },
  };
}

/** The members of the context that the invoker needs. */
export interface CallTarget<T extends SignalRContract> {
  /** Resolves when the hub is connected. */
  waitForConnection: (
    hub: keyof T & HubString,
    timeoutMs: number,
    signal?: AbortSignal,
  ) => Promise<HubConnection>;
  /** The live `HubConnection` of the hub, or `null` when none exists. */
  getConnection: (hub: keyof T & HubString) => HubConnection | null;
  /** With `keepAliveOnUnmount`, a call holds a lazy hub with `acquire` and `release` until it settles. Pass both or neither. */
  acquire?: (hub: keyof T & HubString) => void;
  /** Lowers the count that `acquire` raised. */
  release?: (hub: keyof T & HubString) => void;
}

export interface InvokerOptions<
  T extends SignalRContract,
  H extends keyof T & HubString,
  M extends MethodName<T, H>,
> {
  /** The object that provides `waitForConnection` and `getConnection`. Pass the session context. */
  target: CallTarget<T>;
  /** The hub path. */
  hub: H;
  /** The method name. */
  method: M;
  /** Called at call time. Returns the `InvokeOptions` for this call. */
  getOptions: () => InvokeOptions | undefined;
  /** Called at call time. Aborting the returned signal aborts the call. */
  getSignal?: () => AbortSignal | undefined;
}

/** Builds the stable invoke function for one hub method. */
export function createInvoker<
  T extends SignalRContract,
  H extends keyof T & HubString,
  M extends MethodName<T, H>,
>({
  target,
  hub,
  method,
  getOptions,
  getSignal,
}: InvokerOptions<T, H, M>): (...args: MethodArgs<T, H, M>) => Promise<MethodReturn<T, H, M>> {
  const { waitForConnection, getConnection, acquire, release } = target;
  const attempts = async (
    o: InvokeOptions | undefined,
    args: MethodArgs<T, H, M>,
  ): Promise<MethodReturn<T, H, M>> => {
    const timeout = o?.timeout ?? DEFAULT_TIMEOUT;
    const retries = o?.retries ?? 0;
    const signal = getSignal?.() ?? new AbortController().signal;
    let attempt = 0;
    for (;;) {
      try {
        const connection = await waitForConnection(hub, timeout, signal);
        signal.throwIfAborted();
        return await connection.invoke<MethodReturn<T, H, M>>(method, ...args);
      } catch (error) {
        if (signal.aborted) throw error; // abort wins: never reclassify or retry
        const conn = getConnection(hub);
        const forced = o?.isRetriable?.(error);
        const retriable =
          forced ??
          (isFinalWaitError(error) ? false : conn ? isRetriableInvokeError(error, conn) : true);
        if (!retriable || attempt >= retries) throw error;
        await sleep(resolveBackoff(o?.backoff ?? DEFAULT_BACKOFF, attempt), signal);
        attempt += 1;
      }
    }
  };
  return async (...args: MethodArgs<T, H, M>): Promise<MethodReturn<T, H, M>> => {
    const o = getOptions();
    const holdsHub = o?.keepAliveOnUnmount === true && acquire && release;
    if (holdsHub) acquire(hub);
    try {
      return await attempts(o, args);
    } finally {
      if (holdsHub) release(hub);
    }
  };
}

/** Fire-and-forget sender. It reads the connection at call time, so a teardown handler can capture it. */
export function createSender<
  T extends SignalRContract,
  H extends keyof T & HubString,
  M extends MethodName<T, H>,
>({
  getConnection,
  hub,
  method,
}: {
  getConnection: (hub: H) => HubConnection | null;
  hub: H;
  method: M;
}): (...args: MethodArgs<T, H, M>) => Promise<boolean> {
  return (...args: MethodArgs<T, H, M>): Promise<boolean> => {
    const connection = getConnection(hub);
    if (!connection || connection.state !== HubConnectionState.Connected) {
      return Promise.resolve(false); // dropped: not connected
    }
    // send() is variadic and untyped; args are enforced at the call site.
    return connection.send(method, ...(args as unknown[])).then(
      () => true,
      () => false,
    );
  };
}

/** Teardown sender. It acquires the hub itself, so it still works after its consumer is gone. */
export function createTeardownSender<
  T extends SignalRContract,
  H extends keyof T & HubString,
  M extends MethodName<T, H>,
>({
  target: { acquire, release, waitForConnection },
  hub,
  method,
  getOptions,
}: {
  target: {
    acquire: (hub: H) => void;
    release: (hub: H) => void;
    waitForConnection: (hub: H, timeoutMs: number) => Promise<HubConnection>;
  };
  hub: H;
  method: M;
  getOptions: () => TeardownOptions | undefined;
}): (...args: MethodArgs<T, H, M>) => Promise<boolean> {
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
