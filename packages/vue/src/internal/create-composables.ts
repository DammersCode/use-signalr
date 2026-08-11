import { inject, onScopeDispose, watch } from "vue";
import {
  createAbortScope,
  createInvoker,
  createSender,
  createTeardownSender,
} from "@dammers/use-signalr-core";
import type { InjectionKey } from "vue";
import type {
  EventArgs,
  EventName,
  HubString,
  InvokeOptions,
  MethodName,
  SignalRContract,
  TeardownOptions,
} from "@dammers/use-signalr-core";
import type { SignalRContextValue } from "../types.js";

export function createComposables<T extends SignalRContract>(
  key: InjectionKey<SignalRContextValue<T>>,
) {
  type Hub = keyof T & HubString;

  function useSignalR() {
    const context = inject(key, null);
    if (!context) throw new Error("useSignalR must be used after app.use(signalR, options)");
    return context;
  }
  function useHubConsumer<H extends Hub>(hub: H) {
    const context = useSignalR();
    context.acquire(hub);
    onScopeDispose(() => context.release(hub));
  }
  function useHubStatus<H extends Hub>(hub: H) {
    const context = useSignalR();
    useHubConsumer(hub);
    return context.statusStore.ref(hub);
  }
  function useSignalREvent<H extends Hub, E extends EventName<T, H>>(
    hub: H,
    event: E,
    handler: (...args: EventArgs<T, H, E>) => void,
  ) {
    const context = useSignalR();
    useHubConsumer(hub);
    const stop = watch(
      () => context.statusStore.ref(hub).value,
      (status, _, cleanup) => {
        if (status !== "connected") return;
        const connection = context.getConnection(hub);
        if (!connection) return;
        const listener = (...args: unknown[]) =>
          handler(...(args as EventArgs<T, H, E>));
        connection.on(event, listener);
        cleanup(() => connection.off(event, listener));
      },
      { immediate: true, flush: "sync" },
    );
    onScopeDispose(stop);
  }
  function useOnReconnected<H extends Hub>(hub: H, callback: () => void) {
    const context = useSignalR();
    useHubConsumer(hub);
    const unregister = context.registerReconnect(hub, callback);
    onScopeDispose(unregister);
  }
  function useSignalRInvoke<H extends Hub, M extends MethodName<T, H>>(
    hub: H,
    method: M,
    options?: InvokeOptions,
  ) {
    const context = useSignalR();
    useHubConsumer(hub);
    const scope = createAbortScope();
    onScopeDispose(() => {
      if (!options?.keepAliveOnUnmount) scope.abortAll();
    });
    return createInvoker<T, H, M>(
      context,
      hub,
      method,
      () => options,
      scope.track,
      scope.untrack,
    );
  }
  function useSignalRSend<H extends Hub, M extends MethodName<T, H>>(
    hub: H,
    method: M,
  ) {
    const context = useSignalR();
    useHubConsumer(hub);
    return createSender<T, H, M>(context.getConnection, hub, method);
  }
  function useSignalRTeardown<H extends Hub, M extends MethodName<T, H>>(
    hub: H,
    method: M,
    options?: TeardownOptions,
  ) {
    const context = useSignalR();
    useHubConsumer(hub);
    return createTeardownSender<T, H, M>(context, hub, method, () => options);
  }
  return {
    useSignalR,
    useHubConsumer,
    useHubStatus,
    useSignalREvent,
    useSignalRInvoke,
    useSignalRSend,
    useSignalRTeardown,
    useOnReconnected,
  };
}
