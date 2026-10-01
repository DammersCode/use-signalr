import {
  computed,
  getCurrentInstance,
  getCurrentScope,
  hasInjectionContext,
  inject,
  onMounted,
  onScopeDispose,
  shallowRef,
} from "vue";
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
  SignalRPublicContext,
  TeardownOptions,
} from "@dammers/use-signalr-core";
import type { HubStatusRef } from "../status-store.js";
import type { SignalRContextValue } from "../types.js";

export function createComposables<T extends SignalRContract>(
  key: InjectionKey<SignalRContextValue<T>>,
) {
  type Hub = keyof T & HubString;

  function useInternalContext(name: string) {
    if (!hasInjectionContext())
      throw new Error(`${name} must be called inside setup() or app.runWithContext()`);
    const context = inject(key, null);
    if (!context) throw new Error("useSignalR must be used after app.use(signalR, options)");
    return context;
  }
  function useScopedContext(name: string) {
    if (!getCurrentScope())
      throw new Error(`${name} must be called inside setup() or an effectScope`);
    return useInternalContext(name);
  }
  function useSignalR(): SignalRPublicContext<T> {
    return useInternalContext("useSignalR").publicContext;
  }
  function consume(context: SignalRContextValue<T>, hub: Hub) {
    context.acquire(hub);
    onScopeDispose(() => context.release(hub));
  }
  function useHubConsumer<H extends Hub>(hub: H) {
    consume(useScopedContext("useHubConsumer"), hub);
  }
  function useHubStatus<H extends Hub>(hub: H): HubStatusRef {
    const context = useScopedContext("useHubStatus");
    consume(context, hub);
    const status = context.statusStore.ref(hub);
    if (!getCurrentInstance()?.vnode.el) return status;
    // Async components hydrate after the session started; idle until mount matches the server HTML.
    const mounted = shallowRef(false);
    onMounted(() => {
      mounted.value = true;
    });
    return computed(() => (mounted.value ? status.value : "idle"));
  }
  function useSignalREvent<H extends Hub, E extends EventName<T, H>>(
    hub: H,
    event: E,
    handler: (...args: EventArgs<T, H, E>) => void,
  ) {
    const context = useScopedContext("useSignalREvent");
    consume(context, hub);
    const unsubscribe = context.subscribe(hub, event, (...args) =>
      handler(...(args as EventArgs<T, H, E>)),
    );
    onScopeDispose(unsubscribe);
  }
  function useOnReconnected<H extends Hub>(hub: H, callback: () => void) {
    const context = useScopedContext("useOnReconnected");
    consume(context, hub);
    const unregister = context.registerReconnect(hub, () => callback());
    onScopeDispose(unregister);
  }
  function useSignalRInvoke<H extends Hub, M extends MethodName<T, H>>(
    hub: H,
    method: M,
    options?: InvokeOptions,
  ) {
    const context = useScopedContext("useSignalRInvoke");
    consume(context, hub);
    const scope = createAbortScope();
    onScopeDispose(() => {
      if (!options?.keepAliveOnUnmount) scope.abort();
    });
    return createInvoker<T, H, M>({
      target: context,
      hub,
      method,
      getOptions: () => options,
      getSignal: scope.signal,
    });
  }
  function useSignalRSend<H extends Hub, M extends MethodName<T, H>>(
    hub: H,
    method: M,
  ) {
    const context = useScopedContext("useSignalRSend");
    consume(context, hub);
    return createSender<T, H, M>({ getConnection: context.getConnection, hub, method });
  }
  function useSignalRTeardown<H extends Hub, M extends MethodName<T, H>>(
    hub: H,
    method: M,
    options?: TeardownOptions,
  ) {
    const context = useScopedContext("useSignalRTeardown");
    consume(context, hub);
    return createTeardownSender<T, H, M>({ target: context, hub, method, getOptions: () => options });
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
