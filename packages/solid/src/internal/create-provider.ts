import { createComponent, createEffect, on, onCleanup } from "solid-js";
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

  return function SignalRProvider(props: SignalRProviderProps) {
    const statusStore = createStatusStore<Hub>();

    const session = createSignalRSession({
      hubs,
      resolve,
      statusStore,
      getAccessToken: () => props.accessTokenFactory(),
      onStatusChange: (hub, status) => props.onStatusChange?.(hub, status),
      onError: (hub, err) => props.onError?.(hub, err),
    });

    // One effect — the React deps-array equivalent, body untracked by
    // construction via `on`. props.accessTokenFactory / props.on* are read at
    // call time in async/event contexts, so they are always fresh.
    createEffect(
      on(
        () => [props.baseUrl, props.enabled ?? true, props.connectionKey] as const,
        ([baseUrl, enabled]) => {
          if (!enabled || !baseUrl) {
            session.stop();
            return;
          }
          session.start(baseUrl);
          onCleanup(() => session.stop());
        },
      ),
    );

    return createComponent(Context.Provider, {
      value: session.context,
      get children() {
        return props.children;
      },
    });
  };
}
