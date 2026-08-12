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
): Plugin<[SignalROptions<T>]> {
  return {
    install(app: App, options: SignalROptions<T>) {
      const statusStore = createStatusStore<keyof T & HubString>();
      const session = createSignalRSession<T, typeof statusStore>({
        hubs,
        resolve,
        statusStore,
        getAccessToken: () => options.accessTokenFactory(),
        onStatusChange: (hub, status) => options.onStatusChange?.(hub, status),
        onError: (hub, error) => options.onError?.(hub, error),
      });
      app.provide(key, session.context);

      let disposed = false;
      const dispose = () => {
        if (disposed) return;
        disposed = true;
        scope?.stop();
        session.stop();
      };
      const scope = typeof window === "undefined" ? undefined : effectScope();
      scope?.run(() => {
        watch(
          () => [toValue(options.baseUrl), toValue(options.enabled ?? true), toValue(options.connectionKey)] as const,
          ([baseUrl, enabled]) => {
            session.stop();
            if (enabled && baseUrl) session.start(baseUrl);
          },
          { immediate: true },
        );
      });

      const appWithHook = app as App & { onUnmount?: (callback: () => void) => void };
      if (appWithHook.onUnmount) appWithHook.onUnmount(dispose);
      else {
        const unmount = app.unmount.bind(app);
        app.unmount = () => {
          dispose();
          unmount();
        };
      }
    },
  };
}
