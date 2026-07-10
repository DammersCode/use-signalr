import { createContext } from "react";
import { hubKeys, resolveHubConfig } from "./config";
import { createSignalRProvider } from "./internal/create-provider";
import { createSignalRHooks } from "./internal/create-hooks";
import type {
  HubDef,
  HubString,
  InferContract,
  ResolvedHubConfig,
  SignalRClientConfig,
  SignalRContextValue,
} from "./types";

/**
 * Create a fully-typed SignalR client. Your app contract is INFERRED from
 * `config.hubs` — the KEYS declare which hubs exist, and each hub's
 * `event()`/`method()` declarations declare its events and methods. There is
 * no separately hand-written contract type. Returns a Provider + hooks, all
 * typed against the inferred contract.
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
     * Provider that builds, starts, retries and auto-reconnects every configured
     * hub, exposing them to the hooks via context. Takes no `hubs` prop — it
     * already knows them from the config. Pass `baseUrl` + `accessTokenFactory`
     * (gate with `enabled`); rebuilds when `baseUrl`, `enabled` or `connectionKey`
     * change. Mount it once near the root.
     */
    SignalRProvider,
    /**
     * Escape hatch to the raw SignalR context (`getConnection`, `getStatus`,
     * `isHubConnected`, …). Prefer the typed hooks below; use this only for the
     * underlying `HubConnection` or a non-reactive point read.
     */
    useSignalR: hooks.useSignalR,
    /**
     * Keep a (possibly lazy) hub connected for the component's lifetime without
     * subscribing to events or status. Acquires on mount, releases on unmount.
     */
    useHubConsumer: hooks.useHubConsumer,
    /**
     * Subscribe to a typed server event for the component's lifetime. Handler
     * args are inferred from your contract; re-attaches across reconnects.
     */
    useSignalREffect: hooks.useSignalREffect,
    /**
     * Typed invoker that waits for the connection and resolves with the method's
     * return value. Fails fast by default; opt-in retry (idempotent methods only).
     */
    useSignalRInvoke: hooks.useSignalRInvoke,
    /**
     * Typed fire-and-forget sender. Does not wait for connection: dropped
     * (resolves `false`) if not connected, else dispatched (`true`). Safe in
     * unmount cleanups.
     */
    useSignalRSend: hooks.useSignalRSend,
    /**
     * Typed RELIABLE teardown sender for a method invoked in an effect cleanup.
     * Survives the calling component's unmount, queues while the hub is still
     * connecting (instead of dropping), and holds a lazy hub open until the
     * flush completes. Best-effort: resolves `true` if dispatched, `false` if
     * the hub never connected in time. Never throws.
     */
    useSignalRTeardown: hooks.useSignalRTeardown,
    /**
     * Live connection status of a hub. Re-renders only when THIS hub's status
     * changes. Also keeps a lazy hub connected while mounted.
     */
    useHubStatus: hooks.useHubStatus,
    /**
     * Run a callback after each reconnect (not the first connect), to refetch
     * state that went stale while offline.
     */
    useOnReconnected: hooks.useOnReconnected,
  };
}
