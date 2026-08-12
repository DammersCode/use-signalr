import { h } from "preact";
import { useEffect, useMemo, useRef } from "preact/hooks";
import { createSignalRSession } from "@dammers/use-signalr-core";
import type { Context } from "preact";
import type { HubString, ResolvedHubConfig, SignalRContract, SignalRSession } from "@dammers/use-signalr-core";
import { useLatest } from "../internal-hooks.js";
import { createStatusStore } from "../status-store.js";
import type { StatusStore } from "../status-store.js";
import type { SignalRContextValue, SignalRProviderProps } from "../types.js";

export function createSignalRProvider<T extends SignalRContract>(
  Context: Context<SignalRContextValue<T> | null>, hubs: Array<keyof T & HubString>, resolve: (hub: keyof T & HubString) => ResolvedHubConfig,
) {
  type Hub = keyof T & HubString;
  return function SignalRProvider({ children, baseUrl, accessTokenFactory, enabled = true, connectionKey, onStatusChange, onError }: SignalRProviderProps) {
    const statusStore = useRef(createStatusStore<Hub>()).current;
    const token = useLatest(accessTokenFactory);
    const status = useLatest(onStatusChange);
    const error = useLatest(onError);
    const sessionRef = useRef<SignalRSession<T, StatusStore<Hub>> | null>(null);
    if (!sessionRef.current) sessionRef.current = createSignalRSession<T, StatusStore<Hub>>({
      hubs, resolve, statusStore,
      getAccessToken: () => token.current(),
      onStatusChange: (hub, value) => status.current?.(hub, value),
      onError: (hub, value) => error.current?.(hub, value),
    });
    const session = sessionRef.current;
    useEffect(() => {
      if (enabled && baseUrl) session.start(baseUrl);
      else session.stop();
      return () => session.stop();
    }, [session, baseUrl, enabled, connectionKey]);
    const value = useMemo(() => session.context, [session]);
    return h(Context.Provider, { value }, children);
  };
}
