import {
  createAbortScope,
  createInvoker,
  createSender,
  createSignalRSession,
  createTeardownSender,
  hubKeys,
  resolveHubConfig,
} from "@dammers/use-signalr-core";
import type {
  EventArgs,
  EventName,
  HubDef,
  HubString,
  InferContract,
  InvokeOptions,
  MethodName,
  SignalRClientConfig,
  SignalRContextValueBase,
  SignalRProviderPropsBase,
} from "@dammers/use-signalr-core";
import { createStatusStore } from "./status-store";
import type { ObservableStatusStore } from "./status-store";

export function createSignalRClient<const H extends Record<HubString, HubDef>>(
  config: SignalRClientConfig<H>,
) {
  type T = InferContract<H>;
  type Hub = keyof T & HubString;
  type Context = SignalRContextValueBase<T, ObservableStatusStore<Hub>>;

  const hubs = hubKeys(config);
  const resolved = new Map(hubs.map((hub) => [hub, resolveHubConfig(config, hub)]));

  function createProvider(props: SignalRProviderPropsBase<Hub>) {
    const statusStore = createStatusStore<Hub>();
    const session = createSignalRSession<T, typeof statusStore>({
      hubs,
      resolve: (hub) => resolved.get(hub)!,
      statusStore,
      getAccessToken: () => props.accessTokenFactory(),
      onStatusChange: props.onStatusChange,
      onError: props.onError,
    });
    return {
      context: session.context,
      update: () =>
        session.update({
          baseUrl: props.baseUrl,
          enabled: props.enabled,
          connectionKey: props.connectionKey,
        }),
      dispose: session.stop,
    };
  }

  function onEvent<H extends Hub, E extends EventName<T, H>>(
    context: Context,
    hub: H,
    name: E,
    handler: (...args: EventArgs<T, H, E>) => void,
  ) {
    context.acquire(hub);
    const unsubscribe = context.subscribe(hub, name, (...args) =>
      handler(...(args as EventArgs<T, H, E>)),
    );
    return () => {
      unsubscribe();
      context.release(hub);
    };
  }

  function createCalls<H extends Hub, M extends MethodName<T, H>>(
    context: Context,
    hub: H,
    method: M,
    options?: InvokeOptions,
  ) {
    const scope = createAbortScope();
    context.acquire(hub);
    return {
      invoke: createInvoker<T, H, M>({
        target: context,
        hub,
        method,
        getOptions: () => options,
        getSignal: scope.signal,
      }),
      send: createSender<T, H, M>({ getConnection: context.getConnection, hub, method }),
      teardown: createTeardownSender<T, H, M>({
        target: context,
        hub,
        method,
        getOptions: () => options,
      }),
      dispose: () => {
        if (!options?.keepAliveOnUnmount) scope.abort();
        context.release(hub);
      },
    };
  }

  return { createProvider, onEvent, createCalls };
}
