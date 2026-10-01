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
    hubs.map((h) => [h, resolveHubConfig(config, h)]),
  );
  const resolve = (hub: Hub) => resolved.get(hub)!;

  const contextKey = Symbol("use-signalr");

  const provideSignalR = createSignalRProvider<T>(contextKey, hubs, resolve);
  const hooks = createSignalRHooks<T>(contextKey);

  return {
    /**
     * Builds the session and sets the context. Call it once in your root
     * component's script, before any other function, for example in
     * `+layout.svelte` in SvelteKit. Pass `baseUrl` and `accessTokenFactory`,
     * and gate them with `enabled`. Every hub that is not lazy starts in
     * `onMount`. On the server, the session is disabled and nothing connects,
     * so a call in `onDestroy` fails at once.
     */
    provideSignalR,
    /**
     * Escape hatch to the SignalR context (`getConnection`, `getStatus`,
     * and `waitForConnection`). Call it during component init, below
     * `provideSignalR`. Prefer the typed functions below. Use this only for
     * the underlying `HubConnection` or a point read.
     */
    getSignalR: hooks.getSignalR,
    /**
     * Keeps a hub connected until the component is destroyed, without
     * subscribing to events or status. Call it during component init. It
     * acquires the hub at once and releases it on destroy.
     */
    keepHubAlive: hooks.keepHubAlive,
    /**
     * Subscribes to a typed server event until the component is destroyed.
     * Call it during component init. Handler arguments come from your
     * contract. The subscription survives reconnects and rebuilds.
     */
    onHubEvent: hooks.onHubEvent,
    /**
     * Typed invoker that waits for the connection and resolves with the
     * method's return value. Call it during component init, then call the
     * invoker later. It fails fast by default. Opt in to retry for idempotent
     * methods only. A pending call rejects with an `AbortError` when the
     * component is destroyed, unless `keepAliveOnUnmount` is true. With
     * `keepAliveOnUnmount`, the call also holds a lazy hub open until it settles.
     */
    hubInvoke: hooks.hubInvoke,
    /**
     * Typed fire-and-forget sender. Call it during component init. It does
     * not wait for the connection. It resolves `true` when it sends the call,
     * and `false` when the hub is not connected or the send fails. It never
     * throws, so a cleanup can call it. For a call that must land in a
     * cleanup, use `hubTeardown`.
     */
    hubSend: hooks.hubSend,
    /**
     * Typed teardown sender for a method that you call in `onDestroy`. Call
     * it during component init. It survives the destroy of the component,
     * queues while the hub is still connecting instead of dropping, and holds
     * a lazy hub open until the flush completes. It resolves `true` if it
     * sends the call. It resolves `false` when the hub does not connect in
     * time, when the session is disabled, or when the send fails. It never throws.
     */
    hubTeardown: hooks.hubTeardown,
    /**
     * Live connection status of a hub, as a Svelte store. Call it during
     * component init. Subscribe with `$` to re-render only when this hub's
     * status changes. It also keeps a lazy hub connected until the component
     * is destroyed.
     */
    hubStatus: hooks.hubStatus,
    /**
     * Runs a callback after each reconnect, not the first connect, to refetch
     * state that went stale while offline. Call it during component init.
     */
    onReconnected: hooks.onReconnected,
  };
}
