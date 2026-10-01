import { effectScope, toValue, watch } from "vue";
import type { App, InjectionKey, Plugin } from "vue";
import { createSignalRSession } from "@dammers/use-signalr-core";
import type {
  HubString,
  ResolvedHubConfig,
  SignalRContract,
} from "@dammers/use-signalr-core";
import { createStatusStore } from "../status-store.js";
import type { SignalRContextValue, SignalROptions } from "../types.js";

export function createPlugin<T extends SignalRContract>(
  key: InjectionKey<SignalRContextValue<T>>,
  hubs: Array<keyof T & HubString>,
  resolve: (hub: keyof T & HubString) => ResolvedHubConfig,
): Plugin<[SignalROptions<keyof T & HubString>]> {
  return {
    install(app: App, options: SignalROptions<keyof T & HubString>) {
      const statusStore = createStatusStore<keyof T & HubString>();
      const session = createSignalRSession<T, typeof statusStore>({
        hubs,
        resolve,
        statusStore,
        getAccessToken: () => options.accessTokenFactory(),
        onStatusChange: (hub, status) => options.onStatusChange?.(hub, status),
        onError: (hub, error, info) => options.onError?.(hub, error, info),
      });
      app.provide(key, session.context);

      let disposed = false;
      const dispose = () => {
        if (disposed) return;
        disposed = true;
        scope?.stop();
        session.stop();
      };
      const scope = typeof window === "undefined" ? undefined : effectScope(true);
      const startWatching = () =>
        scope?.run(() => {
          watch(
            () => ({
              baseUrl: toValue(options.baseUrl),
              enabled: toValue(options.enabled ?? true),
              connectionKey: toValue(options.connectionKey),
            }),
            (values) => session.update(values),
            { immediate: true },
          );
        });

      // Starting after mount keeps the first client render equal to the server HTML.
      const mount = app.mount.bind(app);
      app.mount = (...args: Parameters<App["mount"]>) => {
        const instance = mount(...args);
        if (instance) startWatching();
        return instance;
      };

      const unmount = app.unmount.bind(app);
      // On Vue 3.5 types the else branch narrows `app` to never, so it writes through a plain `App`.
      const fallbackTarget: App = app;
      if (hasOnUnmount(app)) app.onUnmount(dispose);
      else {
        fallbackTarget.unmount = () => {
          dispose();
          unmount();
        };
      }
    },
  };
}

// Vue before 3.5 has no app.onUnmount, and its App type does not declare it.
function hasOnUnmount(app: App): app is App & { onUnmount: (cleanup: () => void) => void } {
  return "onUnmount" in app;
}
