import { createContext } from "react";
import { hubKeys, resolveHubConfig } from "@dammers/use-signalr-core";
import { createSignalRProvider } from "./internal/create-provider";
import { createSignalRHooks } from "./internal/create-hooks";
import type {
  HubDef,
  HubString,
  InferContract,
  ResolvedHubConfig,
  SignalRClientConfig,
} from "@dammers/use-signalr-core";
import type { SignalRContextValue } from "./types";

/**
 * Creates a fully-typed SignalR client. Returns a provider and hooks, typed
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
    hubs.map((h) => [h, resolveHubConfig(config, config.hubs[h])]),
  );
  const resolve = (hub: Hub) => resolved.get(hub)!;

  const Context = createContext<SignalRContextValue<T> | null>(null);

  const SignalRProvider = createSignalRProvider<T>(Context, hubs, resolve);
  const hooks = createSignalRHooks<T>(Context);

  return {
    /**
     * Provider that builds, starts, retries, and auto-reconnects every
     * configured hub. Pass `baseUrl` and `accessTokenFactory`, and gate them
     * with `enabled`. Mount it once, near the root.
     */
    SignalRProvider,
    /**
     * Escape hatch to the raw SignalR context (`getConnection`, `getStatus`,
     * `isHubConnected`, and more). Prefer the typed hooks below. Use this only
     * for the underlying `HubConnection` or a non-reactive point read.
     */
    useSignalR: hooks.useSignalR,
    /**
     * Keeps a (possibly lazy) hub connected for the component's lifetime,
     * without subscribing to events or status. Acquires on mount, releases on
     * unmount.
     */
    useHubConsumer: hooks.useHubConsumer,
    /**
     * Subscribes to a typed server event for the component's lifetime.
     * Handler args are inferred from your contract. Re-attaches across
     * reconnects.
     */
    useSignalREffect: hooks.useSignalREffect,
    /**
     * Typed invoker that waits for the connection and resolves with the
     * method's return value. Fails fast by default. Opt in to retry for
     * idempotent methods only.
     */
    useSignalRInvoke: hooks.useSignalRInvoke,
    /**
     * Typed fire-and-forget sender. Does not wait for the connection: it
     * drops the call (resolves `false`) if not connected, otherwise it
     * dispatches the call (`true`). Safe in unmount cleanups.
     */
    useSignalRSend: hooks.useSignalRSend,
    /**
     * Typed RELIABLE teardown sender for a method invoked in an effect
     * cleanup. Survives the calling component's unmount, queues while the hub
     * is still connecting instead of dropping, and holds a lazy hub open
     * until the flush completes. Best-effort: resolves `true` if dispatched,
     * `false` if the hub never connected in time. Never throws.
     */
    useSignalRTeardown: hooks.useSignalRTeardown,
    /**
     * Live connection status of a hub. Re-renders only when THIS hub's status
     * changes. Also keeps a lazy hub connected while mounted.
     */
    useHubStatus: hooks.useHubStatus,
    /**
     * Runs a callback after each reconnect, not the first connect, to refetch
     * state that went stale while offline.
     */
    useOnReconnected: hooks.useOnReconnected,
  };
}
