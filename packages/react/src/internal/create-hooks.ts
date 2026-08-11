import { use, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useLatest } from "../internal-hooks.js";
import {
  createAbortScope,
  createInvoker,
  createSender,
  createTeardownSender,
} from "@dammers/use-signalr-core";
import type { AbortScope } from "@dammers/use-signalr-core";
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
  SignalRContract,
} from "@dammers/use-signalr-core";
import type { SignalRContextValue } from "../types.js";

/** Builds the hooks bound to one client's context. */
export function createSignalRHooks<T extends SignalRContract>(
  ReactContext: Context<SignalRContextValue<T> | null>,
) {
  type Hub = keyof T & HubString;

  /**
   * Escape hatch to the raw SignalR context. Prefer the typed hooks below.
   * Reach for this only when you need the underlying `HubConnection` or a
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
   * Keeps a (possibly lazy) hub alive for this component's lifetime, without
   * subscribing to events or status. Acquires on mount, releases on unmount.
   *
   * Most hooks already do this internally. Use it directly only when you want
   * a lazy hub connected for a component that does not otherwise touch it.
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
   * hub's status changes, not when another hub changes. Also keeps the hub
   * alive while mounted, so a lazy hub connects on first use.
   *
   * @param hub The hub path to watch.
   * @returns `"disconnected" | "connecting" | "connected" | "reconnecting" | "reconnected"`.
   */
  function useHubStatus<H extends Hub>(hub: H): HubConnectionStatus {
    const { statusStore } = useSignalR();
    useHubConsumer(hub);
    const subscribe = useMemo(
      () => (listener: () => void) => statusStore.subscribe(hub, listener),
      [statusStore, hub],
    );
    return useSyncExternalStore(
      subscribe,
      () => statusStore.get(hub),
      () => statusStore.get(hub),
    );
  }

  /**
   * Runs a callback every time a hub reconnects, after a dropped connection
   * is re-established, to refetch state that may have gone stale while
   * offline. Does NOT fire on the first connect, only on reconnects.
   *
   * A fresh closure each render is fine — it does not re-subscribe or fire
   * spuriously, so you do not need to memoize the callback.
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
   * Subscribes to a typed server event for the lifetime of the component. The
   * handler's args are inferred from your contract for `(hub, event)`. The
   * subscription attaches once the hub is connected, re-attaches across
   * reconnects, and detaches on unmount.
   *
   * A fresh closure each render is fine — it does not re-subscribe, so you do
   * not need to memoize the handler.
   *
   * @param hub The hub path.
   * @param event The event name, a key of that hub's `events`.
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
   * Returns a stable, typed function that invokes a hub method and resolves
   * with its return value. It waits, up to `timeout`, for the connection
   * before it invokes, so calling right after mount is safe.
   *
   * Special behavior:
   * - **Fails fast by default** (`retries: 0`): rethrows the raw server error,
   *   so callers see the original.
   * - **Opt-in retry** for retriable failures (transport drops, timeouts),
   *   with jittered backoff. Business errors (a `HubException` thrown while
   *   still connected) are never retried.
   * - **At-least-once when retrying.** Enable `retries` only for IDEMPOTENT methods.
   * - **Auto-aborts** any in-flight call or retry loop on unmount, UNLESS
   *   `keepAliveOnUnmount: true`. For a method invoked in an effect cleanup,
   *   set that flag, or prefer {@link useSignalRTeardown}, which also handles
   *   the hub-still-connecting race.
   *
   * @param hub The hub path.
   * @param method The method name, a key of that hub's `methods`.
   * @param options Optional `retries`, `timeout`, `backoff`, `isRetriable`, `keepAliveOnUnmount`.
   * @returns An async fn that takes the method's typed args and resolves to its typed return.
   * @throws The raw error when `retries === 0`. Otherwise an {@link InvokeError}
   *   that wraps the last failure once attempts are exhausted.
   */
  function useSignalRInvoke<H extends Hub, M extends MethodName<T, H>>(
    hub: H,
    method: M,
    options?: InvokeOptions,
  ) {
    const { waitForConnection, getConnection } = useSignalR();
    useHubConsumer(hub);
    const optsRef = useLatest(options);
    const scopeRef = useRef<AbortScope>(null);
    scopeRef.current ??= createAbortScope();
    const scope = scopeRef.current;
    useEffect(
      () => () => {
        if (!optsRef.current?.keepAliveOnUnmount) scope.abortAll();
      },
      [optsRef, scope],
    );

    return useMemo(
      () =>
        createInvoker<T, H, M>(
          { waitForConnection, getConnection },
          hub,
          method,
          () => optsRef.current,
          scope.track,
          scope.untrack,
        ),
      [waitForConnection, getConnection, hub, method, optsRef, scope],
    );
  }

  /**
   * Returns a stable, typed fire-and-forget sender. Unlike {@link useSignalRInvoke},
   * it does NOT wait for the connection and does NOT return the method's
   * result. If the hub is not Connected, the call is dropped (resolves
   * `false`); otherwise it is dispatched (resolves `true`).
   *
   * Reads the connection at call time and never depends on render-time state,
   * so it is safe to capture in an unmount cleanup.
   *
   * @param hub The hub path.
   * @param method The method name, a key of that hub's `methods`.
   * @returns An async fn that takes the method's typed args and resolves
   *   `true` if dispatched, `false` if dropped because it was not connected.
   */
  function useSignalRSend<H extends Hub, M extends MethodName<T, H>>(
    hub: H,
    method: M,
  ) {
    const { getConnection } = useSignalR();
    useHubConsumer(hub);

    return useMemo(
      () => createSender<T, H, M>(getConnection, hub, method),
      [getConnection, hub, method],
    );
  }

  /**
   * Returns a stable, typed RELIABLE teardown sender, built for a method
   * invoked in an effect cleanup. Unlike {@link useSignalRSend}, which drops
   * a call if not yet connected, and {@link useSignalRInvoke}, which aborts
   * in-flight calls on unmount, the returned function:
   *
   * - **Survives the calling component's unmount.** It runs detached, not
   *   tied to any effect or AbortController, so a call issued in cleanup
   *   still lands.
   * - **Queues while connecting.** It waits, up to `timeout`, for the hub to
   *   (re)connect, then sends, instead of dropping the call.
   * - **Holds a lazy hub open** until the flush completes, even when the
   *   calling component was the last consumer — it acquires and releases
   *   independently.
   * - **Is best-effort and fire-and-forget.** It resolves `true` once
   *   dispatched, `false` if the hub never connected within `timeout`, and
   *   never throws.
   *
   * Trade-off: under StrictMode's mount→cleanup→mount, the intermediate
   * teardown DOES fire, and the remount then re-runs setup. This is correct:
   * the server is never left in a stale joined state, at the cost of one
   * extra round-trip.
   *
   * @param hub The hub path.
   * @param method The teardown method name, a key of that hub's `methods`.
   * @param options Optional `timeout` in ms to wait for a connection. Default 10_000.
   * @returns An async fn that takes the method's typed args and resolves
   *   `true` if dispatched, `false` if the hub never connected in time.
   */
  function useSignalRTeardown<H extends Hub, M extends MethodName<T, H>>(
    hub: H,
    method: M,
    options?: TeardownOptions,
  ) {
    const { acquire, release, waitForConnection } = useSignalR();
    useHubConsumer(hub);
    const optsRef = useLatest(options);

    return useMemo(
      () =>
        createTeardownSender<T, H, M>(
          { acquire, release, waitForConnection },
          hub,
          method,
          () => optsRef.current,
        ),
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
