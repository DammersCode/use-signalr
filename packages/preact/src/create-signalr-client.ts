import { createContext } from "preact";
import { hubKeys, resolveHubConfig } from "@dammers/use-signalr-core";
import type { HubDef, HubString, InferContract, ResolvedHubConfig, SignalRClientConfig } from "@dammers/use-signalr-core";
import { createSignalRHooks } from "./internal/create-hooks.js";
import { createSignalRProvider } from "./internal/create-provider.js";
import type { SignalRContextValue } from "./types.js";

/** Creates a typed SignalR client: a provider and hooks typed against the contract from `config.hubs`. */
export function createSignalRClient<const H extends Record<HubString, HubDef>>(config: SignalRClientConfig<H>) {
  type T = InferContract<H>;
  type Hub = keyof T & HubString;
  const hubs = hubKeys(config);
  const resolved = new Map<Hub, ResolvedHubConfig>(hubs.map((hub) => [hub, resolveHubConfig(config, hub)]));
  const Context = createContext<SignalRContextValue<T> | null>(null);
  const resolve = (hub: Hub) => resolved.get(hub)!;
  const SignalRProvider = createSignalRProvider<T>(Context, hubs, resolve);
  const hooks = createSignalRHooks<T>(Context);
  return {
    /** Provider that builds, starts, retries, and reconnects every configured hub. Mount it once, near the root. */
    SignalRProvider,
    /**
     * Gives access to the SignalR context (`getConnection`, `getStatus`, and
     * `waitForConnection`). Prefer the typed hooks. Use this only for the
     * underlying `HubConnection` or a one-time read.
     */
    useSignalR: hooks.useSignalR,
    /**
     * Keeps a hub, eager or lazy, connected for the component's lifetime,
     * without subscribing to events or status.
     */
    useHubConsumer: hooks.useHubConsumer,
    /**
     * Subscribes to a typed server event for the component's lifetime. Handler
     * arguments are inferred from your contract. The subscription survives
     * reconnects and rebuilds.
     */
    useSignalREffect: hooks.useSignalREffect,
    /**
     * Typed invoker that waits for the connection and resolves with the
     * method's return value. Fails fast by default. Opt in to retry for
     * idempotent methods only. When the component unmounts, a call that still
     * waits rejects with `AbortError`, unless `keepAliveOnUnmount` is `true`.
     * With `keepAliveOnUnmount`, the call also holds a lazy hub open until it settles.
     */
    useSignalRInvoke: hooks.useSignalRInvoke,
    /**
     * Typed fire-and-forget sender. It does not wait for the connection. It
     * resolves `true` when it sends the call, and `false` when the hub is not
     * connected and it drops the call. It also resolves `false` when the send
     * fails. It never throws, so a cleanup can call it. For a call that must
     * land in a cleanup, use `useSignalRTeardown`.
     */
    useSignalRSend: hooks.useSignalRSend,
    /**
     * Typed teardown sender for a method invoked in an effect
     * cleanup. Survives the calling component's unmount, queues while the hub
     * is still connecting instead of dropping, and holds a lazy hub open
     * until the send ends. Resolves `true` if the call is sent.
     * Resolves `false` if the hub does not connect in time,
     * the session stops before the hub connects, the session is disabled, the hub failed, or the send fails or does not end in time. Never
     * throws.
     * If the session stops while the call is pending on a connected hub, the call is sent before the connection closes.
     */
    useSignalRTeardown: hooks.useSignalRTeardown,
    /**
     * Live connection status of a hub. Renders again only when this hub's status
     * changes. Also keeps a lazy hub connected while mounted.
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
