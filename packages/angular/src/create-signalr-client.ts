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
 * Creates a typed SignalR client. Returns a provider function and a set
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
     * Builds, starts, retries, and reconnects on its own every configured hub.
     * Returns `EnvironmentProviders`. Add it to `ApplicationConfig.providers`
     * or to the `providers` array of a route. Pass an options object, or a
     * factory function that can call `inject()`. Give `baseUrl`, and gate the
     * hubs with `enabled`. Each of these can be a plain value, a getter, or a
     * `Signal`. `accessTokenFactory` is a plain function or a `Signal` of one.
     * A getter does not work there. Without `onError`, errors go to Angular's
     * `ErrorHandler`. The connection starts in the browser only, after
     * `afterNextRender`, so the provider is safe during server rendering.
     */
    provideSignalR,
    /**
     * Gives access to the SignalR context (`getConnection`, `getStatus`,
     * and `waitForConnection`). Prefer the typed `inject*` functions below.
     * Use this only for the underlying `HubConnection` or a one-time read.
     */
    injectSignalR: hooks.injectSignalR,
    /**
     * Keeps a hub, eager or lazy, connected for the lifetime of the calling
     * component or injector, without subscribing to events or status. Acquires
     * immediately, releases on `DestroyRef.onDestroy`.
     */
    injectKeepHubAlive: hooks.injectKeepHubAlive,
    /**
     * Subscribes to a typed server event for the lifetime of the calling component or injector.
     * Handler arguments are inferred from your contract. The subscription survives
     * reconnects and rebuilds.
     */
    injectHubEvent: hooks.injectHubEvent,
    /**
     * Typed invoker that waits for the connection and resolves with the
     * method's return value. Fails fast by default. Opt in to retry for
     * idempotent methods only. Pending calls reject with an `AbortError` when
     * the calling component or injector is destroyed, unless `keepAliveOnUnmount` is set.
     * With `keepAliveOnUnmount`, the call also keeps a lazy hub connected
     * until it ends.
     */
    injectHubInvoke: hooks.injectHubInvoke,
    /**
     * Typed fire-and-forget sender. It does not wait for the connection. It
     * resolves `true` when it sends the call, and `false` when the hub is not
     * connected and it drops the call. It also resolves `false` when the send
     * fails. It never throws, so a cleanup can call it. For a call that must
     * land in a cleanup, use `injectHubTeardown`.
     */
    injectHubSend: hooks.injectHubSend,
    /**
     * Typed teardown sender for a method invoked when a component or injector
     * is destroyed. Survives the destroy, queues while the hub is still connecting
     * instead of dropping, and holds a lazy hub open until the send ends.
     * Resolves `true` if the call is sent. Resolves `false` if the hub does
     * not connect in time, the session is disabled, the hub failed, or the
     * send fails. Never throws.
     */
    injectHubTeardown: hooks.injectHubTeardown,
    /**
     * Live connection status of a hub, as a granular `Signal`. Reading it in
     * a `computed()`/effect/template runs again only when this hub's status
     * changes. Also keeps a lazy hub connected while the calling component or injector is
     * alive.
     */
    injectHubStatus: hooks.injectHubStatus,
    /**
     * Runs a callback after each reconnect, not the first connect, to refetch
     * state that went stale while offline. It also runs after a rebuild, but
     * only for a hub that was connected before.
     */
    injectOnReconnected: hooks.injectOnReconnected,
  };
}
