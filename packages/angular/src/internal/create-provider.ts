import {
  DestroyRef,
  EnvironmentInjector,
  afterNextRender,
  effect,
  inject,
  isSignal,
  makeEnvironmentProviders,
  untracked,
} from "@angular/core";
import type { EnvironmentProviders, InjectionToken, Signal } from "@angular/core";
import { createSignalRSession } from "@dammers/use-signalr-core";
import type { HubString, ResolvedHubConfig, SignalRContract } from "@dammers/use-signalr-core";
import { createStatusStore } from "../status-store.js";
import type {
  MaybeSignal,
  SignalRContextValue,
  SignalROptions,
  TokenFactory,
} from "../types.js";

function resolveMaybeSignal<T>(value: MaybeSignal<T>): T {
  if (isSignal(value)) return value();
  if (typeof value === "function") return (value as () => T)();
  return value;
}

/** A plain factory is the value itself — only a Signal wrapper may be unwrapped. */
function resolveTokenFactory(value: TokenFactory | Signal<TokenFactory>): TokenFactory {
  return isSignal(value) ? value() : value;
}

/** Builds the `provideSignalR` function bound to one client's context token. */
export function createSignalRProvider<T extends SignalRContract>(
  contextToken: InjectionToken<SignalRContextValue<T>>,
  hubs: Array<keyof T & HubString>,
  resolve: (hub: keyof T & HubString) => ResolvedHubConfig,
) {
  return function provideSignalR(options: SignalROptions): EnvironmentProviders {
    return makeEnvironmentProviders([
      {
        provide: contextToken,
        useFactory: (): SignalRContextValue<T> => {
          const injector = inject(EnvironmentInjector);
          const statusStore = createStatusStore<keyof T & HubString>();

          const session = createSignalRSession<T, typeof statusStore>({
            hubs,
            resolve,
            statusStore,
            getAccessToken: () => resolveTokenFactory(options.accessTokenFactory)(),
            onStatusChange: (hub, status) => options.onStatusChange?.(hub, status),
            onError: (hub, err) => options.onError?.(hub, err),
          });

          // No connection work happens here or in the effect below during SSR:
          // afterNextRender never runs on the server, so `start` stays inert.
          const start = () => {
            const enabled = resolveMaybeSignal(options.enabled ?? true);
            const baseUrl = resolveMaybeSignal(options.baseUrl);
            resolveMaybeSignal(options.connectionKey); // read only to trigger a rebuild on change
            // Reads made by session.stop()/start() (status-store dedupe checks,
            // connection state) must not become tracked deps of this effect —
            // only baseUrl/enabled/connectionKey should trigger a rebuild.
            untracked(() => {
              session.stop();
              if (!enabled || !baseUrl) return;
              session.start(baseUrl);
            });
          };

          afterNextRender(
            () => {
              effect(start, { injector });
            },
            { injector },
          );

          inject(DestroyRef).onDestroy(() => session.stop());

          return session.context;
        },
      },
    ]);
  };
}
