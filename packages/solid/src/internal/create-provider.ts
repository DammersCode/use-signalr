import { createComponent, createEffect, onCleanup, untrack } from "solid-js";
import { createStatusStore } from "../status-store.js";
import { createSignalRSession } from "@dammers/use-signalr-core";
import type { Context } from "solid-js";
import type { HubString, ResolvedHubConfig, SignalRContract } from "@dammers/use-signalr-core";
import type { SignalRContextValue, SignalRProviderProps } from "../types.js";

/** Builds the `SignalRProvider` component bound to one client's context. */
export function createSignalRProvider<T extends SignalRContract>(
  Context: Context<SignalRContextValue<T> | null>,
  hubs: Array<keyof T & HubString>,
  resolve: (hub: keyof T & HubString) => ResolvedHubConfig,
) {
  type Hub = keyof T & HubString;

  return function SignalRProvider(props: SignalRProviderProps<Hub>) {
    const statusStore = createStatusStore<Hub>();

    const session = createSignalRSession({
      hubs,
      resolve,
      statusStore,
      getAccessToken: () => props.accessTokenFactory(),
      onStatusChange: (hub, status) => props.onStatusChange?.(hub, status),
      onError: (hub, err, info) => props.onError?.(hub, err, info),
    });

    createEffect(() => {
      const values = {
        baseUrl: props.baseUrl,
        enabled: props.enabled,
        connectionKey: props.connectionKey,
      };
      // Untracked: stop() reads status signals, and the effect must track only the props.
      untrack(() => session.update(values));
    });
    onCleanup(() => session.stop());

    return createComponent(Context.Provider, {
      value: session.context,
      get children() {
        return props.children;
      },
    });
  };
}
