import {
  DestroyRef,
  EnvironmentInjector,
  ErrorHandler,
  NgZone,
  PLATFORM_ID,
  afterNextRender,
  effect,
  inject,
  isSignal,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
  untracked,
} from "@angular/core";
import type { EnvironmentProviders, InjectionToken, Signal } from "@angular/core";
import { createSignalRSession } from "@dammers/use-signalr-core";
import type { HubString, ResolvedHubConfig, SignalRContract, SignalRErrorInfo } from "@dammers/use-signalr-core";
import { createStatusStore } from "../status-store.js";
import type {
  MaybeSignal,
  SignalRContextValue,
  SignalROptions,
  TokenFactory,
} from "../types.js";

function isGetter<T>(value: MaybeSignal<T>): value is () => T {
  return typeof value === "function";
}

function resolveMaybeSignal<T>(value: MaybeSignal<T>): T {
  if (isSignal(value)) return value();
  return isGetter(value) ? value() : value;
}

/** A plain factory is the value itself. Only a Signal wrapper is unwrapped. */
function resolveTokenFactory(value: TokenFactory | Signal<TokenFactory>): TokenFactory {
  return isSignal(value) ? value() : value;
}

/** Builds the `provideSignalR` function bound to one client's context token. */
export function createSignalRProvider<T extends SignalRContract>(
  contextToken: InjectionToken<SignalRContextValue<T>>,
  hubs: Array<keyof T & HubString>,
  resolve: (hub: keyof T & HubString) => ResolvedHubConfig,
) {
  return function provideSignalR(
    optionsOrFactory: SignalROptions<keyof T & HubString> | (() => SignalROptions<keyof T & HubString>),
  ): EnvironmentProviders {
    return makeEnvironmentProviders([
      {
        provide: contextToken,
        useFactory: (): SignalRContextValue<T> => {
          const injector = inject(EnvironmentInjector);
          const errorHandler = inject(ErrorHandler);
          const ngZone = inject(NgZone);
          // Same check as isPlatformServer, without a dependency on @angular/common.
          const isServer = inject(PLATFORM_ID) === "server";
          const options =
            typeof optionsOrFactory === "function" ? optionsOrFactory() : optionsOrFactory;
          const statusStore = createStatusStore<keyof T & HubString>();
          // Depth of synchronous session work that runs outside the zone, often inside a change detection tick.
          let outsideDepth = 0;
          const outside = <R,>(work: () => R): R => {
            outsideDepth++;
            try {
              return ngZone.runOutsideAngular(work);
            } finally {
              outsideDepth--;
            }
          };
          // Entering the zone during a tick starts a nested tick (NG0101), so such callbacks wait one microtask.
          const report = (hub: keyof T & HubString, err: unknown, info: SignalRErrorInfo) =>
            options.onError ? options.onError(hub, err, info) : errorHandler.handleError(err);
          const inZone = (callback: () => void) => {
            if (outsideDepth > 0) queueMicrotask(() => ngZone.run(callback));
            else ngZone.run(callback);
          };

          const session = createSignalRSession<T, typeof statusStore>({
            hubs,
            resolve,
            statusStore,
            getAccessToken: () => resolveTokenFactory(options.accessTokenFactory)(),
            onStatusChange: (hub, status) =>
              inZone(() => {
                // A deferred call runs outside the session's own guard, so it reports its error itself.
                try {
                  options.onStatusChange?.(hub, status);
                } catch (error) {
                  report(hub, error, { source: "callback" });
                }
              }),
            onError: (hub, err, info) => inZone(() => report(hub, err, info)),
          });

          const sync = () => {
            const values = {
              baseUrl: resolveMaybeSignal(options.baseUrl),
              enabled: resolveMaybeSignal(options.enabled ?? true),
              connectionKey: resolveMaybeSignal(options.connectionKey),
            };
            // session.update reads store state, so only the values above can be tracked.
            untracked(() => outside(() => session.update(values)));
          };

          if (isServer) {
            session.update({ baseUrl: undefined, enabled: false, connectionKey: undefined });
          } else {
            afterNextRender(
              () => {
                effect(sync, { injector });
              },
              { injector },
            );
          }

          inject(DestroyRef).onDestroy(() => session.stop());

          const { context } = session;
          return {
            ...context,
            acquire: (hub) => outside(() => context.acquire(hub)),
            release: (hub) => outside(() => context.release(hub)),
            subscribe: (hub, event, handler) =>
              context.subscribe(hub, event, (...args) => ngZone.run(() => handler(...args))),
            registerReconnect: (hub, callback) =>
              context.registerReconnect(hub, () => ngZone.run(callback)),
          };
        },
      },
      provideEnvironmentInitializer(() => {
        inject(contextToken);
      }),
    ]);
  };
}
