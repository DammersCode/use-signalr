import { useEffect, useRef } from "react";
import { useLatest } from "../internal-hooks.js";
import { createStatusStore } from "../status-store.js";
import { createSignalRSession } from "@dammers/use-signalr-core";
import type { Context } from "react";
import type {
  HubString,
  ResolvedHubConfig,
  SignalRContract,
  SignalRSession,
} from "@dammers/use-signalr-core";
import type { StatusStore } from "../status-store.js";
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
  }: SignalRProviderProps<Hub>) {
    const tokenFactoryRef = useLatest(accessTokenFactory);
    const onStatusChangeRef = useLatest(onStatusChange);
    const onErrorRef = useLatest(onError);

    const sessionRef = useRef<SignalRSession<T, StatusStore<Hub>>>(null);
    sessionRef.current ??= createSignalRSession<T, StatusStore<Hub>>({
      hubs,
      resolve,
      statusStore: createStatusStore<Hub>(),
      getAccessToken: () => tokenFactoryRef.current(),
      onStatusChange: (hub, status) => onStatusChangeRef.current?.(hub, status),
      onError: (hub, err, info) => onErrorRef.current?.(hub, err, info),
    });
    const session = sessionRef.current;

    const stopPending = useRef(false);

    useEffect(() => {
      stopPending.current = false;
      session.update({ baseUrl, enabled, connectionKey });
      return () => {
        stopPending.current = true;
        // StrictMode re-runs the effect synchronously, so a deferred stop can be cancelled.
        queueMicrotask(() => {
          if (stopPending.current) session.stop();
        });
      };
    }, [session, baseUrl, enabled, connectionKey]);

    return <ReactContext value={session.context}>{children}</ReactContext>;
  };
}
