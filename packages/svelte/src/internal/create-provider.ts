import { setContext, onMount } from "svelte";
import { derived, readable } from "svelte/store";
import type { Readable } from "svelte/store";
import { createStatusStore } from "../status-store.js";
import { createSignalRSession } from "@dammers/use-signalr-core";
import type { HubString, ResolvedHubConfig, SignalRContract } from "@dammers/use-signalr-core";
import type { SignalRContextValue, SignalRProviderProps } from "../types.js";

function isReadable(value: unknown): value is Readable<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "subscribe" in value &&
    typeof (value as Readable<unknown>).subscribe === "function"
  );
}

function toReadable<T>(value: T | Readable<T>): Readable<T> {
  return isReadable(value) ? value : readable(value, () => {});
}

/** Builds the `provideSignalR` function bound to one client's context. */
export function createSignalRProvider<T extends SignalRContract>(
  contextKey: symbol,
  hubs: Array<keyof T & HubString>,
  resolve: (hub: keyof T & HubString) => ResolvedHubConfig,
) {
  type Hub = keyof T & HubString;

  return function provideSignalR(props: SignalRProviderProps): void {
    const statusStore = createStatusStore<Hub>();

    const session = createSignalRSession({
      hubs,
      resolve,
      statusStore,
      getAccessToken: () => props.accessTokenFactory(),
      onStatusChange: (hub, status) => props.onStatusChange?.(hub, status),
      onError: (hub, err) => props.onError?.(hub, err),
    });

    const baseUrl$ = toReadable(props.baseUrl);
    const enabled$ = toReadable(props.enabled ?? true);
    const connectionKey$ = toReadable(props.connectionKey);
    const identity$ = derived(
      [baseUrl$, enabled$, connectionKey$],
      ([baseUrl, enabled]) => [baseUrl, enabled] as const,
    );

    // All connection work is client-side only: onMount never runs during SSR.
    onMount(() => {
      const unsubscribe = identity$.subscribe(([baseUrl, enabled]) => {
        session.stop();
        if (!enabled || !baseUrl) return;
        session.start(baseUrl);
      });

      return () => {
        unsubscribe();
        session.stop();
      };
    });

    setContext(contextKey, session.context);
  };
}
