import { InjectionToken } from "@angular/core";
import { hubKeys, resolveHubConfig } from "@dammers/use-signalr-core";
import { createSignalRProvider } from "./internal/create-provider.js";
import { createSignalRHooks } from "./internal/create-hooks.js";
import type {
  HubDef,
  HubString,
  InferContract,
  ResolvedHubConfig,
  SignalRClientConfig,
} from "@dammers/use-signalr-core";
import type { SignalRContextValue } from "./types.js";

/**
 * Creates a fully-typed SignalR client. Returns a provider function and a set
 * of `inject*` functions, typed against the contract inferred from
 * `config.hubs`: the keys declare the hubs, and each hub's
 * `event()`/`method()` declarations declare its events and methods.
 */
export function createSignalRClient<const H extends Record<HubString, HubDef>>(
  config: SignalRClientConfig<H>,
) {
  type T = InferContract<H>;
  type Hub = keyof T & HubString;

  const hubs = hubKeys(config);
  const resolved = new Map<Hub, ResolvedHubConfig>(
    hubs.map((h) => [h, resolveHubConfig(config, h)]),
  );
  const resolve = (hub: Hub) => resolved.get(hub)!;

  const contextToken = new InjectionToken<SignalRContextValue<T>>("use-signalr");

  const provideSignalR = createSignalRProvider<T>(contextToken, hubs, resolve);
  const hooks = createSignalRHooks<T>(contextToken);

  return {
    /**
     * Builds, starts, retries, and auto-reconnects every configured hub.
     * Returns `EnvironmentProviders` — add it to `ApplicationConfig.providers`
     * (or a route's `providers` array). Pass an options object, or a factory
     * that can call `inject()`. Give `baseUrl` and `accessTokenFactory`, and
     * gate with `enabled`. Each can be a plain value or a zero-arg
     * getter/`Signal`, so token rotation and enable/disable stay reactive.
     * Without `onError`, errors go to Angular's `ErrorHandler`. All
     * connection work happens client-side only (inside `afterNextRender`), so
     * this is safe to provide during SSR.
     */
    provideSignalR,
    /**
     * Escape hatch to the SignalR context (`getConnection`, `getStatus`,
     * and `waitForConnection`). Prefer the typed `inject*` functions below.
     * Use this only for the underlying `HubConnection` or a point read.
     */
    injectSignalR: hooks.injectSignalR,
    /**
     * Keeps a (possibly lazy) hub connected for the injection scope's
     * lifetime, without subscribing to events or status. Acquires
     * immediately, releases on `DestroyRef.onDestroy`.
     */
    injectKeepHubAlive: hooks.injectKeepHubAlive,
    /**
     * Subscribes to a typed server event for the injection scope's lifetime.
     * Handler args are inferred from your contract. The subscription survives
     * reconnects and rebuilds.
     */
    injectHubEvent: hooks.injectHubEvent,
    /**
     * Typed invoker that waits for the connection and resolves with the
     * method's return value. Fails fast by default. Opt in to retry for
     * idempotent methods only. Pending calls reject with an `AbortError` when
     * the injection scope is destroyed, unless `keepAliveOnUnmount` is set.
     * With `keepAliveOnUnmount`, the call also keeps a lazy hub connected
     * until it ends.
     */
    injectHubInvoke: hooks.injectHubInvoke,
    /**
     * Typed fire-and-forget sender. It does not wait for the connection. It resolves
     * `true` when it sends the call, and `false` when the hub is not connected and
     * it drops the call. It never throws, so a cleanup can call it. For a call that
     * must land in a cleanup, use
     * `injectHubTeardown`.
     */
    injectHubSend: hooks.injectHubSend,
    /**
     * Typed teardown sender for a method invoked in a teardown.
     * Survives the calling scope's disposal, queues while the hub is still
     * connecting instead of dropping, and holds a lazy hub open until the
     * flush completes. Best-effort: resolves `true` if dispatched, `false`
     * if the hub never connected in time. Never throws.
     */
    injectHubTeardown: hooks.injectHubTeardown,
    /**
     * Live connection status of a hub, as a granular `Signal`. Reading it in
     * a `computed()`/effect/template re-runs only when this hub's status
     * changes. Also keeps a lazy hub connected while the injection scope is
     * alive.
     */
    injectHubStatus: hooks.injectHubStatus,
    /**
     * Runs a callback after each reconnect and after each rebuild, not the
     * first connect, to refetch state that went stale while offline.
     */
    injectOnReconnected: hooks.injectOnReconnected,
  };
}
