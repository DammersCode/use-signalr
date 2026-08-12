import { useEffect, useMemo, useRef } from "react";
import { useLatest } from "../internal-hooks.js";
import { createStatusStore } from "../status-store.js";
import { createSignalRSession } from "@dammers/use-signalr-core";
import type { Context } from "react";
import type { HubString, ResolvedHubConfig, SignalRContract } from "@dammers/use-signalr-core";
import type { SignalRContextValue, SignalRProviderProps } from "../types.js";

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

    // Latest props via refs, so once-attached handlers call the current props.
    const tokenFactoryRef = useLatest(accessTokenFactory);
    const onStatusChangeRef = useLatest(onStatusChange);
    const onErrorRef = useLatest(onError);

    const session = useRef(
      createSignalRSession({
        hubs,
        resolve,
        statusStore,
        getAccessToken: () => tokenFactoryRef.current(),
        onStatusChange: (hub, status) => onStatusChangeRef.current?.(hub, status),
        onError: (hub, err) => onErrorRef.current?.(hub, err),
      }),
    ).current;

    useEffect(() => {
      if (!enabled || !baseUrl) {
        session.stop();
        return;
      }
      session.start(baseUrl);
      return () => session.stop();
      // Rebuild only when the connection identity changes. tokenFactoryRef and
      // on*Ref are stable; props are read through .current.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [baseUrl, enabled, connectionKey]);

    const value = useMemo<SignalRContextValue<T>>(() => session.context, [session]);

    return <ReactContext value={value}>{children}</ReactContext>;
  };
}
