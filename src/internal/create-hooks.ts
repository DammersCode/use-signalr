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
  TeardownOptions,
  MethodArgs,
  MethodName,
  MethodReturn,
  SignalRContextValue,
  SignalRContract,
} from "../types";

const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_TEARDOWN_TIMEOUT = 10_000;

/** Build the hooks bound to one client's context. */
export function createSignalRHooks<T extends SignalRContract>(
  ReactContext: Context<SignalRContextValue<T> | null>,
) {
  type Hub = keyof T & HubString;

  /**
   * Escape hatch to the raw SignalR context. Prefer the typed hooks below;
   * reach for this only when you need the underlying `HubConnection` or a
   * non-reactive point read.
   *
   * @returns The context value: `getConnection`, `isHubConnected`, `getStatus`,
   *   `waitForConnection`, `acquire`/`release`, `registerReconnect`, `statusStore`.
   * @throws If called outside a `<SignalRProvider>`.
   */
  function useSignalR() {
    const ctx = use(ReactContext);
    if (!ctx)
      throw new Error("useSignalR must be used within a SignalRProvider");
    return ctx;
  }

  /**
   * Keep a (possibly lazy) hub alive for this component's lifetime without
   * subscribing to events or status. Acquires on mount, releases on unmount.
   *
   * Most hooks already do this internally — use it directly only when you want
   * a lazy hub connected for a component that doesn't otherwise touch it.
   *
   * @param hub The hub path to keep connected.
   */
  function useHubConsumer(hub: Hub) {
    const { acquire, release } = useSignalR();
    useEffect(() => {
      acquire(hub);
      return () => release(hub);
    }, [hub, acquire, release]);
  }

  /**
   * Live connection status of a hub. Re-renders the component only when THIS
   * hub's status changes (not when other hubs change). Also keeps the hub
   * alive while mounted, so a lazy hub connects on first use.
   *
   * @param hub The hub path to watch.
   * @returns `"disconnected" | "connecting" | "connected" | "reconnecting" | "reconnected"`.
   */
  function useHubStatus<H extends Hub>(hub: H): HubConnectionStatus {
    const { statusStore } = useSignalR();
    useHubConsumer(hub);
    return useSyncExternalStore(
      statusStore.subscribe,
      () => statusStore.get(hub),
      () => statusStore.get(hub),
    );
  }

  /**
   * Run a callback every time a hub reconnects (after a dropped connection is
   * re-established), to refetch state that may have gone stale while offline.
   * Does NOT fire on the first connect, only on reconnects.
   *
   * The callback is read through a ref, so passing a fresh closure each render
   * is fine — it won't re-subscribe or fire spuriously.
   *
   * @param hub The hub path to watch.
   * @param callback Invoked after each successful reconnect.
   */
  function useOnReconnected<H extends Hub>(hub: H, callback: () => void) {
    const { registerReconnect } = useSignalR();
    useHubConsumer(hub);
    const cbRef = useLatest(callback);
    useEffect(
      () => registerReconnect(hub, () => cbRef.current()),
      [hub, registerReconnect, cbRef],
    );
  }

  /**
   * Subscribe to a typed server event for the lifetime of the component. The
   * handler's args are inferred from your contract for `(hub, event)`. The
   * subscription attaches once the hub is connected and re-attaches across
   * reconnects; it detaches on unmount.
   *
   * The handler is read through a ref, so a fresh closure each render is fine —
   * it won't re-subscribe.
   *
   * @param hub The hub path.
   * @param event The event name (key of that hub's `events`).
   * @param handler Called with the event's typed args each time the server pushes it.
   */
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

  /**
   * Returns a stable, typed function that invokes a hub method and resolves with
   * its return value. It waits (up to `timeout`) for the connection before
   * invoking, so calling right after mount is safe.
   *
   * Special behavior:
   * - **Fails fast by default** (`retries: 0`): rethrows the raw server error so
   *   callers see the original.
   * - **Opt-in retry** for retriable failures (transport drops, timeouts) with
   *   jittered backoff. Business errors (a `HubException` thrown while still
   *   connected) are never retried.
   * - **At-least-once when retrying** — only enable `retries` for IDEMPOTENT methods.
   * - **Auto-aborts** any in-flight call/retry loop on unmount, UNLESS
   *   `keepAliveOnUnmount: true`. For a method invoked in an effect cleanup, set
   *   that flag — or prefer {@link useSignalRTeardown}, which also handles the
   *   hub-still-connecting race.
   *
   * @param hub The hub path.
   * @param method The method name (key of that hub's `methods`).
   * @param options Optional `retries`, `timeout`, `backoff`, `isRetriable`, `keepAliveOnUnmount`.
   * @returns An async fn taking the method's typed args, resolving to its typed return.
   * @throws The raw error when `retries === 0`; otherwise an {@link InvokeError}
   *   wrapping the last failure once attempts are exhausted.
   */
  function useSignalRInvoke<H extends Hub, M extends MethodName<T, H>>(
    hub: H,
    method: M,
    options?: InvokeOptions,
  ) {
    const { waitForConnection, getConnection } = useSignalR();
    useHubConsumer(hub);
    const optsRef = useLatest(options);
    const abortRef = useRef<AbortController | null>(null);
    useEffect(
      () => () => {
        if (!optsRef.current?.keepAliveOnUnmount) abortRef.current?.abort();
      },
      [optsRef],
    );

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
   * Returns a stable, typed fire-and-forget sender. Unlike {@link useSignalRInvoke},
   * it does NOT wait for the connection and does NOT return the method's result:
   * if the hub isn't Connected the call is dropped (resolves `false`); otherwise
   * it's dispatched (resolves `true`).
   *
   * Reads the connection at call time and never depends on render-time state, so
   * it's safe to capture in an unmount cleanup.
   *
   * @param hub The hub path.
   * @param method The method name (key of that hub's `methods`).
   * @returns An async fn taking the method's typed args, resolving `true` if
   *   dispatched or `false` if dropped (not connected).
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

  /**
   * Returns a stable, typed RELIABLE teardown sender, built for a method invoked
   * in an effect cleanup. Unlike {@link useSignalRSend} (which drops if not yet
   * connected) and {@link useSignalRInvoke} (which aborts in-flight calls on
   * unmount), the returned function:
   *
   * - **Survives the calling component's unmount** — it runs detached, not tied
   *   to any effect or AbortController, so a call issued in cleanup still lands.
   * - **Queues while connecting** — waits (up to `timeout`) for the hub to
   *   (re)connect, then sends, instead of dropping the call.
   * - **Holds a lazy hub open** until the flush completes, even when the calling
   *   component was the last consumer (it acquires/releases independently).
   * - **Best-effort & fire-and-forget** — resolves `true` once dispatched,
   *   `false` if the hub never connected within `timeout`. Never throws.
   *
   * Trade-off: under StrictMode's mount→cleanup→mount, the intermediate teardown
   * DOES fire (then the remount re-runs setup) — correct, so the server is never
   * left in a stale joined state, at the cost of one extra round-trip.
   *
   * @param hub The hub path.
   * @param method The teardown method name (key of that hub's `methods`).
   * @param options Optional `timeout` (ms) to wait for a connection. Default 10_000.
   * @returns An async fn taking the method's typed args, resolving `true` if
   *   dispatched or `false` if the hub never connected in time.
   */
  function useSignalRTeardown<H extends Hub, M extends MethodName<T, H>>(
    hub: H,
    method: M,
    options?: TeardownOptions,
  ) {
    const { acquire, release, waitForConnection } = useSignalR();
    useHubConsumer(hub);
    const optsRef = useLatest(options);

    return useCallback(
      (...args: MethodArgs<T, H, M>): Promise<boolean> => {
        const timeout = optsRef.current?.timeout ?? DEFAULT_TEARDOWN_TIMEOUT;
        acquire(hub); // hold the hub open past our own unmount until flushed
        return (async () => {
          try {
            const connection = await waitForConnection(hub, timeout);
            await connection.send(method, ...(args as unknown[]));
            return true;
          } catch {
            return false; // never connected in time, or send failed: best-effort
          } finally {
            release(hub);
          }
        })();
      },
      [acquire, release, waitForConnection, hub, method, optsRef],
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
    useSignalRTeardown,
  };
}
