import { hubKeys, resolveHubConfig } from "@dammers/use-signalr-core";
import type { InjectionKey } from "vue";
import type {
  HubDef,
  HubString,
  InferContract,
  ResolvedHubConfig,
  SignalRClientConfig,
} from "@dammers/use-signalr-core";
import { createComposables } from "./internal/create-composables.js";
import { createPlugin } from "./internal/create-plugin.js";
import type { SignalRContextValue } from "./types.js";

/** Creates a typed Vue plugin and the composables bound to its app context. */
export function createSignalRClient<const H extends Record<HubString, HubDef>>(
  config: SignalRClientConfig<H>,
) {
  type T = InferContract<H>;
  type Hub = keyof T & HubString;
  const hubs = hubKeys(config);
  const resolved = new Map<Hub, ResolvedHubConfig>(
    hubs.map((hub) => [hub, resolveHubConfig(config, hub)]),
  );
  const key: InjectionKey<SignalRContextValue<T>> = Symbol("use-signalr");
  const plugin = createPlugin<T>(key, hubs, (hub) => resolved.get(hub)!);
  const composables = createComposables<T>(key);
  return Object.assign(plugin, {
    /**
     * Gives the SignalR context (`getConnection`, `getStatus`, and
     * `waitForConnection`). Use it for the underlying `HubConnection` or a
     * one-time read. Prefer the typed composables. Call it in `setup()` or inside
     * `app.runWithContext()`.
     */
    useSignalR: composables.useSignalR,
    /**
     * Keeps a hub, eager or lazy, connected while the scope is alive, without
     * subscribing to events or status. Call it in `setup()`, or inside an
     * effect scope that runs in `app.runWithContext()`.
     */
    useHubConsumer: composables.useHubConsumer,
    /**
     * Gives the live connection status of a hub as a read-only `Ref`. It
     * updates only when this hub's status changes. It also keeps a lazy hub
     * connected while the scope is alive. A component that hydrates shows
     * `"idle"` until it mounts. Call it in `setup()`, or inside an effect scope
     * that runs in `app.runWithContext()`.
     */
    useHubStatus: composables.useHubStatus,
    /**
     * Subscribes to a typed server event while the scope is alive. Handler
     * arguments come from your contract. The subscription survives reconnects
     * and rebuilds. Call it in `setup()`, or inside an effect scope that runs
     * in `app.runWithContext()`.
     */
    useSignalREvent: composables.useSignalREvent,
    /**
     * Gives a typed invoker that waits for the connection and resolves with
     * the method's return value. It fails fast by default. Opt in to retry for
     * idempotent methods only. When the scope ends, a waiting call rejects
     * with `AbortError`, unless you set `keepAliveOnUnmount`. With it, the call
     * also holds a lazy hub open until it settles. Call it in `setup()`, or
     * inside an effect scope that runs in `app.runWithContext()`.
     */
    useSignalRInvoke: composables.useSignalRInvoke,
    /**
     * Gives a typed fire-and-forget sender. It does not wait for the
     * connection. It resolves `true` when it sends the call, and `false` when
     * the hub is not connected and it drops the call. It also resolves `false`
     * when the send fails. It never throws, so a cleanup can call it. For a
     * call that must land in a cleanup, use `useSignalRTeardown`. Call it in
     * `setup()`, or inside an effect scope that runs in
     * `app.runWithContext()`.
     */
    useSignalRSend: composables.useSignalRSend,
    /**
     * Gives a typed teardown sender for a method that a cleanup invokes. It
     * survives the end of the calling scope, queues while the hub connects,
     * and holds a lazy hub open until the call is sent. It resolves `true`
     * if the call is sent. It resolves `false` if the hub does not connect in
     * time, the session is disabled, the hub failed, or the send fails. It
     * never throws. Call it in `setup()`, or inside an effect scope that runs
     * in `app.runWithContext()`.
     */
    useSignalRTeardown: composables.useSignalRTeardown,
    /**
     * Runs a callback after each reconnect, not the first connect, to refetch
     * state that went stale while offline. It also runs after a rebuild, but
     * only for a hub that was connected before. Call it in `setup()`, or inside
     * an effect scope that runs in `app.runWithContext()`.
     */
    useOnReconnected: composables.useOnReconnected,
  });
}
