import { createContext } from "solid-js";
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
 * Creates a typed SignalR client. Returns a provider and hooks, typed
 * against the contract inferred from `config.hubs`: the keys declare the
 * hubs, and each hub's `event()`/`method()` declarations declare its events
 * and methods.
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

  const Context = createContext<SignalRContextValue<T> | null>(null);

  const SignalRProvider = createSignalRProvider<T>(Context, hubs, resolve);
  const hooks = createSignalRHooks<T>(Context);

  return {
    /**
     * Provider that builds, starts, retries, and reconnects on its own every
     * configured hub. Pass `baseUrl` and `accessTokenFactory`, and gate them
     * with `enabled`. Mount it once, above every `<Suspense>`, or `<Loading>` on Solid 2. It reads `baseUrl`, `enabled`, and `connectionKey` as reactive props.
     */
    SignalRProvider,
    /**
     * Gives access to the SignalR context (`getConnection`, `getStatus`,
     * and `waitForConnection`). Prefer the typed hooks below. Use this only
     * for the underlying `HubConnection` or a one-time read.
     */
    useSignalR: hooks.useSignalR,
    /**
     * Keeps a hub connected for the lifetime of its owner,
     * without subscribing to events or status. Acquires at setup, releases on
     * cleanup.
     */
    useHubConsumer: hooks.useHubConsumer,
    /**
     * Subscribes to a typed server event for the lifetime of its owner.
     * Handler arguments are inferred from your contract. The subscription survives
     * reconnects and rebuilds.
     */
    useSignalREffect: hooks.useSignalREffect,
    /**
     * Typed invoker that waits for the connection and resolves with the
     * method's return value. Fails fast by default. Opt in to retry for
     * idempotent methods only. A pending call rejects with an `AbortError` when
     * its owner is disposed, unless `keepAliveOnUnmount` is true. With
     * `keepAliveOnUnmount`, the call also holds a lazy hub open until it settles.
     */
    useSignalRInvoke: hooks.useSignalRInvoke,
    /**
     * Typed fire-and-forget sender. It does not wait for the connection. It resolves
     * `true` when it sends the call, and `false` when the hub is not connected and
     * it drops the call. It also resolves `false` when the send fails. It never
     * throws, so a cleanup can call it. For a call that must land in a cleanup,
     * use `useSignalRTeardown`.
     */
    useSignalRSend: hooks.useSignalRSend,
    /**
     * Typed teardown sender for a method invoked in a cleanup. Survives the
     * disposal of the calling component, queues while the hub is still
     * connecting instead of dropping, and holds a lazy hub open until the send
     * ends. Resolves `true` if the call is sent. Resolves `false` if the hub
     * does not connect in time, the session is disabled, the hub failed, or
     * the send fails. Never throws.
     * If the session stops while the call is in flight on a connected hub, the call is sent before the connection closes.
     */
    useSignalRTeardown: hooks.useSignalRTeardown,
    /**
     * Live connection status of a hub, as an accessor. Runs the tracking
     * scope again only when this hub's status changes. Also keeps a lazy hub
     * connected until its owner is disposed.
     */
    useHubStatus: hooks.useHubStatus,
    /**
     * Runs a callback after each reconnect, not the first connect, to refetch
     * state that went stale while offline. It also runs after a rebuild, but
     * only for a hub that was connected before.
     */
    useOnReconnected: hooks.useOnReconnected,
  };
}
