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

/**
 * Creates a fully-typed SignalR client. Returns a provider function and a set
 * of stores/functions, typed against the contract inferred from
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
    hubs.map((h) => [h, resolveHubConfig(config, config.hubs[h])]),
  );
  const resolve = (hub: Hub) => resolved.get(hub)!;

  const contextKey = Symbol("use-signalr");

  const provideSignalR = createSignalRProvider<T>(contextKey, hubs, resolve);
  const hooks = createSignalRHooks<T>(contextKey);

  return {
    /**
     * Builds, starts, retries, and auto-reconnects every configured hub. Call
     * once in your root component's script, before any other function — for
     * example `+layout.svelte` in SvelteKit. Pass `baseUrl` and
     * `accessTokenFactory`, and gate them with `enabled`. All connection work
     * happens client-side only, so this is safe to call during SSR.
     */
    provideSignalR,
    /**
     * Escape hatch to the raw SignalR context (`getConnection`, `getStatus`,
     * `isHubConnected`, and more). Prefer the typed stores/functions below.
     * Use this only for the underlying `HubConnection` or a point read.
     */
    getSignalR: hooks.getSignalR,
    /**
     * Keeps a (possibly lazy) hub connected for the component's lifetime,
     * without subscribing to events or status. Acquires at component init,
     * releases on destroy.
     */
    keepHubAlive: hooks.keepHubAlive,
    /**
     * Subscribes to a typed server event for the component's lifetime.
     * Handler args are inferred from your contract. Re-attaches across
     * reconnects.
     */
    onHubEvent: hooks.onHubEvent,
    /**
     * Typed invoker that waits for the connection and resolves with the
     * method's return value. Fails fast by default. Opt in to retry for
     * idempotent methods only.
     */
    hubInvoke: hooks.hubInvoke,
    /**
     * Typed fire-and-forget sender. Does not wait for the connection: it
     * drops the call (resolves `false`) if not connected, otherwise it
     * dispatches the call (`true`). Safe in teardowns.
     */
    hubSend: hooks.hubSend,
    /**
     * Typed RELIABLE teardown sender for a method invoked in a teardown.
     * Survives the calling component's disposal, queues while the hub is
     * still connecting instead of dropping, and holds a lazy hub open until
     * the flush completes. Best-effort: resolves `true` if dispatched,
     * `false` if the hub never connected in time. Never throws.
     */
    hubTeardown: hooks.hubTeardown,
    /**
     * Live connection status of a hub, as a Svelte store. Subscribe with `$`
     * to re-render only when THIS hub's status changes. Also keeps a lazy hub
     * connected while mounted.
     */
    hubStatus: hooks.hubStatus,
    /**
     * Runs a callback after each reconnect, not the first connect, to refetch
     * state that went stale while offline.
     */
    onReconnected: hooks.onReconnected,
  };
}
