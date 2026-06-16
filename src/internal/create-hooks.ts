import { use, useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { HubConnectionState } from "@microsoft/signalr";
import { useLatest } from "../internal-hooks";
import {
  DEFAULT_BACKOFF,
  InvokeError,
  isRetriableInvokeError,
  resolveBackoff,
  sleep,
} from "../retry";
import type { Context } from "react";
import type {
  EventArgs,
  EventName,
  HubConnectionStatus,
  HubString,
  InvokeOptions,
  MethodArgs,
  MethodName,
  MethodReturn,
  SignalRContextValue,
  SignalRContract,
} from "../types";

const DEFAULT_TIMEOUT = 10_000;

/** Build the hooks bound to one client's context. */
export function createSignalRHooks<T extends SignalRContract>(
  ReactContext: Context<SignalRContextValue<T> | null>,
) {
  type Hub = keyof T & HubString;

  function useSignalR() {
    const ctx = use(ReactContext);
    if (!ctx)
      throw new Error("useSignalR must be used within a SignalRProvider");
    return ctx;
  }

  /** Keep a (possibly lazy) hub alive for this component's lifetime. */
  function useHubConsumer(hub: Hub) {
    const { acquire, release } = useSignalR();
    useEffect(() => {
      acquire(hub);
      return () => release(hub);
    }, [hub, acquire, release]);
  }

  /** Live connection status of a hub. Re-renders only when THIS hub changes. */
  function useHubStatus<H extends Hub>(hub: H): HubConnectionStatus {
    const { statusStore } = useSignalR();
    useHubConsumer(hub);
    return useSyncExternalStore(
      statusStore.subscribe,
      () => statusStore.get(hub),
      () => statusStore.get(hub),
    );
  }

  /** Run a callback after a hub reconnects (e.g. to refetch state). */
  function useOnReconnected<H extends Hub>(hub: H, callback: () => void) {
    const { registerReconnect } = useSignalR();
    useHubConsumer(hub);
    const cbRef = useLatest(callback);
    useEffect(
      () => registerReconnect(hub, () => cbRef.current()),
      [hub, registerReconnect, cbRef],
    );
  }

  /** Subscribe to a typed server event for the lifetime of the component. */
  function useSignalREffect<H extends Hub, E extends EventName<T, H>>(
    hub: H,
    event: E,
    handler: (...args: EventArgs<T, H, E>) => void,
  ) {
    const { getConnection } = useSignalR();
    const status = useHubStatus(hub); // acquires lazy hub + re-renders on connect
    const handlerRef = useLatest(handler);

    useEffect(() => {
      const connection = getConnection(hub);
      if (!connection || status !== "connected") return;
      const listener = (...args: unknown[]) =>
        handlerRef.current(...(args as EventArgs<T, H, E>));
      connection.on(event, listener);
      return () => connection.off(event, listener);
    }, [hub, event, status, getConnection, handlerRef]);
  }

  /** Returns a typed function that invokes a hub method, waiting for connection. */
  function useSignalRInvoke<H extends Hub, M extends MethodName<T, H>>(
    hub: H,
    method: M,
    options?: InvokeOptions,
  ) {
    const { waitForConnection, getConnection } = useSignalR();
    useHubConsumer(hub);
    const optsRef = useLatest(options);
    const abortRef = useRef<AbortController | null>(null);
    useEffect(() => () => abortRef.current?.abort(), []);

    return useCallback(
      async (...args: MethodArgs<T, H, M>): Promise<MethodReturn<T, H, M>> => {
        const o = optsRef.current;
        const timeout = o?.timeout ?? DEFAULT_TIMEOUT;
        const retries = o?.retries ?? 0;
        const ac = (abortRef.current = new AbortController());
        let attempt = 0;
        for (;;) {
          try {
            const connection = await waitForConnection(hub, timeout);
            return await connection.invoke<MethodReturn<T, H, M>>(
              method,
              ...args,
            );
          } catch (error) {
            const conn = getConnection(hub);
            const forced = o?.isRetriable?.(error);
            const retriable =
              forced ?? (conn ? isRetriableInvokeError(error, conn) : true);
            if (!retriable || attempt >= retries) {
              // No retries: rethrow the raw error so callers see the original.
              if (retries === 0) throw error;
              throw new InvokeError(
                `SignalR invoke ${hub}/${String(method)} failed after ${attempt + 1} attempts`,
                error,
                attempt + 1,
                retriable,
              );
            }
            await sleep(
              resolveBackoff(o?.backoff ?? DEFAULT_BACKOFF, attempt),
              ac.signal,
            );
            attempt += 1;
          }
        }
      },
      [waitForConnection, getConnection, hub, method, optsRef],
    );
  }

  /**
   * Stable, typed fire-and-forget sender. Does not wait for connection: if the
   * hub isn't Connected the call is dropped (resolves `false`), else `true`.
   * Reads the connection at call time, so it's safe to use in unmount cleanups.
   */
  function useSignalRSend<H extends Hub, M extends MethodName<T, H>>(
    hub: H,
    method: M,
  ) {
    const { getConnection } = useSignalR();
    useHubConsumer(hub);

    return useCallback(
      (...args: MethodArgs<T, H, M>): Promise<boolean> => {
        const connection = getConnection(hub);
        if (!connection || connection.state !== HubConnectionState.Connected) {
          return Promise.resolve(false); // dropped: not connected
        }
        // send is variadic-untyped; args are enforced at the call site.
        return connection.send(method, ...(args as unknown[])).then(() => true);
      },
      [getConnection, hub, method],
    );
  }

  return {
    useSignalR,
    useHubConsumer,
    useHubStatus,
    useOnReconnected,
    useSignalREffect,
    useSignalRInvoke,
    useSignalRSend,
  };
}
