import { useEffect, useMemo, useRef } from "react";
import { useLatest } from "../internal-hooks";
import { createStatusStore } from "../status-store";
import { createConnectionManager } from "@dammers/use-signalr-core";
import type { Context } from "react";
import type { ConnectionManager } from "@dammers/use-signalr-core";
import type { HubString, ResolvedHubConfig, SignalRContract } from "@dammers/use-signalr-core";
import type { SignalRContextValue, SignalRProviderProps } from "../types";

/** Builds the `SignalRProvider` component bound to one client's context. */
export function createSignalRProvider<T extends SignalRContract>(
  ReactContext: Context<SignalRContextValue<T> | null>,
  hubs: Array<keyof T & HubString>,
  resolve: (hub: keyof T & HubString) => ResolvedHubConfig,
) {
  type Hub = keyof T & HubString;

  return function SignalRProvider({
    children,
    baseUrl,
    accessTokenFactory,
    enabled = true,
    connectionKey,
    onStatusChange,
    onError,
  }: SignalRProviderProps) {
    const statusStore = useRef(createStatusStore<Hub>()).current;

    // Lazy ref-counts, pending stop timers, and reconnect listeners persist
    // across rebuilds. The live manager is swapped per generation.
    const refCounts = useRef(new Map<Hub, number>()).current;
    const stopTimers = useRef(
      new Map<Hub, ReturnType<typeof setTimeout>>(),
    ).current;
    const reconnectListeners = useRef(new Map<Hub, Set<() => void>>()).current;
    const managerRef = useRef<ConnectionManager<Hub> | null>(null);

    // Latest props via refs, so once-attached handlers call the current props.
    const tokenFactoryRef = useLatest(accessTokenFactory);
    const onStatusChangeRef = useLatest(onStatusChange);
    const onErrorRef = useLatest(onError);

    useEffect(() => {
      if (!enabled || !baseUrl) {
        managerRef.current?.dispose();
        managerRef.current = null;
        hubs.forEach((h) => statusStore.set(h, "disconnected"));
        return;
      }

      const manager: ConnectionManager<Hub> = createConnectionManager<Hub>({
        baseUrl,
        hubs,
        resolve,
        getAccessToken: () => tokenFactoryRef.current(),
        refCounts,
        stopTimers,
        reconnectListeners,
        onStatus: (hub, status) => {
          statusStore.set(hub, status);
          onStatusChangeRef.current?.(hub, status);
        },
        onError: (hub, err) => onErrorRef.current?.(hub, err),
        isCurrent: () => managerRef.current === manager,
      });
      managerRef.current = manager;
      manager.reconcile(); // build eager hubs plus already-referenced lazy hubs

      return () => {
        manager.dispose();
        if (managerRef.current === manager) managerRef.current = null;
      };
      // Rebuild only when the connection identity changes. tokenFactoryRef and
      // on*Ref are stable; props are read through .current.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [baseUrl, enabled, connectionKey]);

    const value = useMemo<SignalRContextValue<T>>(
      () => ({
        getConnection: (hub) => managerRef.current?.getConnection(hub) ?? null,
        isHubConnected: (hub) => statusStore.get(hub) === "connected",
        getStatus: (hub) => statusStore.get(hub),
        statusStore,
        waitForConnection: (hub, timeoutMs) => {
          const manager = managerRef.current;
          if (!manager) {
            return Promise.reject(
              new Error(`SignalR not connected: ${String(hub)}`),
            );
          }
          return manager.waitForConnection(hub, timeoutMs);
        },
        acquire: (hub) => {
          const next = (refCounts.get(hub) ?? 0) + 1;
          refCounts.set(hub, next);
          if (next === 1) managerRef.current?.reconcile();
        },
        release: (hub) => {
          const next = Math.max(0, (refCounts.get(hub) ?? 0) - 1);
          refCounts.set(hub, next);
          if (next === 0) managerRef.current?.reconcile();
        },
        registerReconnect: (hub, cb) => {
          let set = reconnectListeners.get(hub);
          if (!set) reconnectListeners.set(hub, (set = new Set()));
          set.add(cb);
          return () => set!.delete(cb);
        },
      }),
      [statusStore, refCounts, reconnectListeners],
    );

    return <ReactContext value={value}>{children}</ReactContext>;
  };
}
