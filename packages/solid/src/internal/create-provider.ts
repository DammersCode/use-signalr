import { createComponent, createEffect, on, onCleanup } from "solid-js";
import { createStatusStore } from "../status-store";
import { createConnectionManager } from "@dammers/use-signalr-core";
import type { Context } from "solid-js";
import type { ConnectionManager } from "@dammers/use-signalr-core";
import type { HubString, ResolvedHubConfig, SignalRContract } from "@dammers/use-signalr-core";
import type { SignalRContextValue, SignalRProviderProps } from "../types";

/** Builds the `SignalRProvider` component bound to one client's context. */
export function createSignalRProvider<T extends SignalRContract>(
  Context: Context<SignalRContextValue<T> | null>,
  hubs: Array<keyof T & HubString>,
  resolve: (hub: keyof T & HubString) => ResolvedHubConfig,
) {
  type Hub = keyof T & HubString;

  return function SignalRProvider(props: SignalRProviderProps) {
    const statusStore = createStatusStore<Hub>();

    // Lazy ref-counts, pending stop timers, and reconnect listeners persist
    // across rebuilds. The live manager is swapped per generation.
    const refCounts = new Map<Hub, number>();
    const stopTimers = new Map<Hub, ReturnType<typeof setTimeout>>();
    const reconnectListeners = new Map<Hub, Set<() => void>>();
    let current: ConnectionManager<Hub> | null = null;

    // One effect — the React deps-array equivalent, body untracked by
    // construction via `on`. props.accessTokenFactory / props.on* are read at
    // call time in async/event contexts, so they are always fresh.
    createEffect(
      on(
        () => [props.baseUrl, props.enabled ?? true, props.connectionKey] as const,
        ([baseUrl, enabled]) => {
          if (!enabled || !baseUrl) {
            current?.dispose();
            current = null;
            hubs.forEach((h) => statusStore.set(h, "disconnected"));
            return;
          }

          const manager: ConnectionManager<Hub> = createConnectionManager<Hub>({
            baseUrl,
            hubs,
            resolve,
            getAccessToken: () => props.accessTokenFactory(),
            refCounts,
            stopTimers,
            reconnectListeners,
            onStatus: (hub, status) => {
              statusStore.set(hub, status);
              props.onStatusChange?.(hub, status);
            },
            onError: (hub, err) => props.onError?.(hub, err),
            isCurrent: () => current === manager,
          });
          current = manager;
          manager.reconcile(); // build eager hubs plus already-referenced lazy hubs

          onCleanup(() => {
            manager.dispose();
            if (current === manager) current = null;
          });
        },
      ),
    );

    const value: SignalRContextValue<T> = {
      getConnection: (hub) => current?.getConnection(hub) ?? null,
      isHubConnected: (hub) => statusStore.get(hub) === "connected",
      getStatus: (hub) => statusStore.get(hub),
      statusStore,
      waitForConnection: (hub, timeoutMs) => {
        if (!current) {
          return Promise.reject(
            new Error(`SignalR not connected: ${String(hub)}`),
          );
        }
        return current.waitForConnection(hub, timeoutMs);
      },
      acquire: (hub) => {
        const next = (refCounts.get(hub) ?? 0) + 1;
        refCounts.set(hub, next);
        if (next === 1) current?.reconcile();
      },
      release: (hub) => {
        const next = Math.max(0, (refCounts.get(hub) ?? 0) - 1);
        refCounts.set(hub, next);
        if (next === 0) current?.reconcile();
      },
      registerReconnect: (hub, cb) => {
        let set = reconnectListeners.get(hub);
        if (!set) reconnectListeners.set(hub, (set = new Set()));
        set.add(cb);
        return () => set!.delete(cb);
      },
    };

    return createComponent(Context.Provider, {
      value,
      get children() {
        return props.children;
      },
    });
  };
}
