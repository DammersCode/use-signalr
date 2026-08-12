import { DestroyRef, assertInInjectionContext, effect, inject } from "@angular/core";
import type { InjectionToken, Signal } from "@angular/core";
import type { HubConnection } from "@microsoft/signalr";
import {
  createAbortScope,
  createInvoker,
  createSender,
  createTeardownSender,
} from "@dammers/use-signalr-core";
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

/** Builds the inject* functions bound to one client's context token. */
export function createSignalRHooks<T extends SignalRContract>(
  contextToken: InjectionToken<SignalRContextValue<T>>,
) {
  type Hub = keyof T & HubString;

  /**
   * Escape hatch to the raw SignalR context. Prefer the typed `inject*`
   * helpers below. Reach for this only when you need the underlying
   * `HubConnection` or a point read.
   *
   * @returns The context value: `getConnection`, `isHubConnected`, `getStatus`,
   *   `waitForConnection`, `acquire`/`release`, `registerReconnect`, `statusStore`.
   * @throws If called outside an injection context, or below `provideSignalR`.
   */
  function injectSignalR(): SignalRContextValue<T> {
    assertInInjectionContext(injectSignalR);
    const ctx = inject(contextToken, { optional: true });
    if (!ctx) {
      throw new Error(
        "injectSignalR must be called in an injection context below provideSignalR",
      );
    }
    return ctx;
  }

  /**
   * Acquires a (possibly lazy) hub for the injection scope's lifetime,
   * without subscribing to events or status. Releases on `DestroyRef.onDestroy`.
   *
   * Most helpers already do this internally. Use it directly only when you
   * want a lazy hub connected for a scope that does not otherwise touch it.
   *
   * @param hub The hub path to keep connected.
   */
  function injectKeepHubAlive(hub: Hub): void {
    assertInInjectionContext(injectKeepHubAlive);
    const { acquire, release } = injectSignalR();
    acquire(hub);
    inject(DestroyRef).onDestroy(() => release(hub));
  }

  /**
   * Live connection status of a hub, as a granular `Signal`. Reading it in a
   * `computed()`/effect/template re-runs only when THIS hub's status
   * changes, never when another hub's status changes. Also keeps the hub
   * alive for the injection scope's lifetime, so a lazy hub connects on
   * first use.
   *
   * @param hub The hub path to watch.
   */
  function injectHubStatus<H extends Hub>(hub: H): Signal<HubConnectionStatus> {
    assertInInjectionContext(injectHubStatus);
    const { statusStore } = injectSignalR();
    injectKeepHubAlive(hub);
    return statusStore.signal(hub);
  }

  /**
   * Runs a callback every time a hub reconnects, after a dropped connection
   * is re-established, to refetch state that may have gone stale while
   * offline. Does NOT fire on the first connect, only on reconnects.
   *
   * @param hub The hub path to watch.
   * @param callback Invoked after each successful reconnect.
   */
  function injectOnReconnected<H extends Hub>(hub: H, callback: () => void): void {
    assertInInjectionContext(injectOnReconnected);
    const { registerReconnect } = injectSignalR();
    injectKeepHubAlive(hub);
    const unsub = registerReconnect(hub, () => callback());
    inject(DestroyRef).onDestroy(unsub);
  }

  /**
   * Subscribes to a typed server event for the injection scope's lifetime.
   * The handler's args are inferred from your contract for `(hub, event)`.
   * The subscription attaches once the hub is connected, re-attaches across
   * reconnects, and detaches on `DestroyRef.onDestroy`.
   *
   * @param hub The hub path.
   * @param event The event name, a key of that hub's `events`.
   * @param handler Called with the event's typed args each time the server pushes it.
   */
  function injectHubEvent<H extends Hub, E extends EventName<T, H>>(
    hub: H,
    event: E,
    handler: (...args: EventArgs<T, H, E>) => void,
  ): void {
    assertInInjectionContext(injectHubEvent);
    const { statusStore, getConnection } = injectSignalR();
    injectKeepHubAlive(hub);

    let attachedConn: HubConnection | null = null;
    const listener = (...args: unknown[]) => handler(...(args as EventArgs<T, H, E>));

    const detach = () => {
      if (!attachedConn) return;
      attachedConn.off(event, listener);
      attachedConn = null;
    };

    const status = statusStore.signal(hub);
    // injectHubEvent asserts an injection context, so effect() needs no
    // explicit injector here; it re-runs only when THIS hub's signal changes.
    const watchRef = effect(() => {
      const value = status();
      if (value !== "connected") {
        detach();
        return;
      }
      if (attachedConn) return; // already attached this connected phase
      const connection = getConnection(hub);
      if (!connection) return;
      connection.on(event, listener);
      attachedConn = connection;
    });

    inject(DestroyRef).onDestroy(() => {
      watchRef.destroy();
      detach();
    });
  }

  /**
   * Returns a stable, typed function that invokes a hub method and resolves
   * with its return value. It waits, up to `timeout`, for the connection
   * before it invokes, so calling right after injection is safe.
   *
   * Special behavior:
   * - **Fails fast by default** (`retries: 0`): rethrows the raw server error,
   *   so callers see the original.
   * - **Opt-in retry** for retriable failures (transport drops, timeouts),
   *   with jittered backoff. Business errors (a `HubException` thrown while
   *   still connected) are never retried.
   * - **At-least-once when retrying.** Enable `retries` only for IDEMPOTENT methods.
   * - **Auto-aborts** any in-flight call or retry loop on `DestroyRef.onDestroy`,
   *   UNLESS `keepAliveOnUnmount: true`. For a method invoked in a teardown, set
   *   that flag, or prefer {@link injectHubTeardown}, which also handles the
   *   hub-still-connecting race.
   *
   * @param hub The hub path.
   * @param method The method name, a key of that hub's `methods`.
   * @param options Optional `retries`, `timeout`, `backoff`, `isRetriable`, `keepAliveOnUnmount`.
   * @returns An async fn that takes the method's typed args and resolves to its typed return.
   * @throws The raw error when `retries === 0`. Otherwise an `InvokeError`
   *   that wraps the last failure once attempts are exhausted.
   */
  function injectHubInvoke<H extends Hub, M extends MethodName<T, H>>(
    hub: H,
    method: M,
    options?: InvokeOptions,
  ) {
    assertInInjectionContext(injectHubInvoke);
    const { waitForConnection, getConnection } = injectSignalR();
    injectKeepHubAlive(hub);
    const scope = createAbortScope();
    inject(DestroyRef).onDestroy(() => {
      if (!options?.keepAliveOnUnmount) scope.abortAll();
    });

    return createInvoker<T, H, M>(
      { waitForConnection, getConnection },
      hub,
      method,
      () => options,
      scope.track,
      scope.untrack,
    );
  }

  /**
   * Returns a stable, typed fire-and-forget sender. Unlike {@link injectHubInvoke},
   * it does NOT wait for the connection and does NOT return the method's
   * result. If the hub is not Connected, the call is dropped (resolves
   * `false`); otherwise it is dispatched (resolves `true`).
   *
   * Reads the connection at call time and never depends on reactive state, so
   * it is safe to capture in a teardown.
   *
   * @param hub The hub path.
   * @param method The method name, a key of that hub's `methods`.
   * @returns An async fn that takes the method's typed args and resolves
   *   `true` if dispatched, `false` if dropped because it was not connected.
   */
  function injectHubSend<H extends Hub, M extends MethodName<T, H>>(hub: H, method: M) {
    assertInInjectionContext(injectHubSend);
    const { getConnection } = injectSignalR();
    injectKeepHubAlive(hub);

    return createSender<T, H, M>(getConnection, hub, method);
  }

  /**
   * Returns a stable, typed RELIABLE teardown sender, built for a method
   * invoked in a teardown. Unlike {@link injectHubSend}, which drops a call
   * if not yet connected, and {@link injectHubInvoke}, which aborts
   * in-flight calls on `DestroyRef.onDestroy`, the returned function:
   *
   * - **Survives the calling scope's disposal.** It runs detached, not tied
   *   to any subscription or AbortController, so a call issued in
   *   `DestroyRef.onDestroy` still lands.
   * - **Queues while connecting.** It waits, up to `timeout`, for the hub to
   *   (re)connect, then sends, instead of dropping the call.
   * - **Holds a lazy hub open** until the flush completes, even when the
   *   calling scope was the last consumer — it acquires and releases
   *   independently.
   * - **Is best-effort and fire-and-forget.** It resolves `true` once
   *   dispatched, `false` if the hub never connected within `timeout`, and
   *   never throws.
   *
   * @param hub The hub path.
   * @param method The teardown method name, a key of that hub's `methods`.
   * @param options Optional `timeout` in ms to wait for a connection. Default 10_000.
   * @returns An async fn that takes the method's typed args and resolves
   *   `true` if dispatched, `false` if the hub never connected in time.
   */
  function injectHubTeardown<H extends Hub, M extends MethodName<T, H>>(
    hub: H,
    method: M,
    options?: TeardownOptions,
  ) {
    assertInInjectionContext(injectHubTeardown);
    const { acquire, release, waitForConnection } = injectSignalR();
    injectKeepHubAlive(hub);

    return createTeardownSender<T, H, M>(
      { acquire, release, waitForConnection },
      hub,
      method,
      () => options,
    );
  }

  return {
    injectSignalR,
    injectKeepHubAlive,
    injectHubStatus,
    injectOnReconnected,
    injectHubEvent,
    injectHubInvoke,
    injectHubSend,
    injectHubTeardown,
  };
}
