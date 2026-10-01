import { setContext, onMount } from "svelte";
import { derived, readable } from "svelte/store";
import type { Readable } from "svelte/store";
import { createStatusStore } from "../status-store.js";
import { createSignalRSession } from "@dammers/use-signalr-core";
import type { HubString, ResolvedHubConfig, SignalRContract } from "@dammers/use-signalr-core";
import type { SignalRProviderProps } from "../types.js";

function isReadable(value: unknown): value is Readable<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "subscribe" in value &&
    typeof value.subscribe === "function"
  );
}

function toReadable<T>(value: T | Readable<T>): Readable<T> {
  return isReadable(value) ? value : readable(value);
}

/** Builds the `provideSignalR` function bound to one client's context. */
export function createSignalRProvider<T extends SignalRContract>(
  contextKey: symbol,
  hubs: Array<keyof T & HubString>,
  resolve: (hub: keyof T & HubString) => ResolvedHubConfig,
) {
  type Hub = keyof T & HubString;

  return function provideSignalR(props: SignalRProviderProps<Hub>): void {
    const statusStore = createStatusStore<Hub>();

    const session = createSignalRSession({
      hubs,
      resolve,
      statusStore,
      getAccessToken: () => props.accessTokenFactory(),
      onStatusChange: (hub, status) => props.onStatusChange?.(hub, status),
      onError: (hub, err, info) => props.onError?.(hub, err, info),
    });

    const baseUrl$ = toReadable(props.baseUrl);
    const enabled$ = toReadable(props.enabled ?? true);
    const connectionKey$ = toReadable(props.connectionKey);
    const identity$ = derived(
      [baseUrl$, enabled$, connectionKey$],
      ([baseUrl, enabled, connectionKey]) => ({ baseUrl, enabled, connectionKey }),
    );

    // Svelte runs onDestroy but not onMount on the server, so a waiting call must fail at once.
    if (typeof window === "undefined") {
      session.update({ baseUrl: undefined, enabled: false, connectionKey: undefined });
    }

    onMount(() => {
      let first = true;
      let stopped = false;
      let pending: Parameters<typeof session.update>[0] | undefined;

      const unsubscribe = identity$.subscribe((values) => {
        if (first) {
          first = false;
          session.update(values);
          return;
        }
        const scheduled = pending !== undefined;
        pending = values;
        if (scheduled) return;
        queueMicrotask(() => {
          if (stopped || !pending) return;
          const latest = pending;
          pending = undefined;
          session.update(latest);
        });
      });

      return () => {
        stopped = true;
        unsubscribe();
        session.stop();
      };
    });

    setContext(contextKey, session.context);
  };
}
