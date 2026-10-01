import { onCleanup, useContext } from "solid-js";
import type { Accessor, Context } from "solid-js";
import {
  createAbortScope,
  createInvoker,
  createSender,
  createTeardownSender,
} from "@dammers/use-signalr-core";
import type {
  EventArgs,
  EventName,
  HubConnectionStatus,
  HubString,
  InvokeOptions,
  TeardownOptions,
  MethodName,
  SignalRContract,
  SignalRPublicContext,
} from "@dammers/use-signalr-core";
import type { SignalRContextValue } from "../types.js";

/** Builds the hooks bound to one client's context. */
export function createSignalRHooks<T extends SignalRContract>(
  Context: Context<SignalRContextValue<T> | null>,
) {
  type Hub = keyof T & HubString;

  function useInternalContext() {
    const ctx = useContext(Context);
    if (!ctx)
      throw new Error("useSignalR must be used within a SignalRProvider");
    return ctx;
  }

  function useSignalR(): SignalRPublicContext<T> {
    return useInternalContext().publicContext;
  }

  function useHubConsumer(hub: Hub) {
    const { acquire, release } = useInternalContext();
    acquire(hub);
    onCleanup(() => release(hub));
  }

  function useHubStatus<H extends Hub>(hub: H): Accessor<HubConnectionStatus> {
    const { statusStore } = useInternalContext();
    useHubConsumer(hub);
    return () => statusStore.get(hub);
  }

  function useOnReconnected<H extends Hub>(hub: H, callback: () => void) {
    const { registerReconnect } = useInternalContext();
    useHubConsumer(hub);
    const unsub = registerReconnect(hub, () => callback());
    onCleanup(unsub);
  }

  function useSignalREffect<H extends Hub, E extends EventName<T, H>>(
    hub: H,
    event: E,
    handler: (...args: EventArgs<T, H, E>) => void,
  ) {
    const { subscribe } = useInternalContext();
    useHubConsumer(hub);

    const listener = (...args: unknown[]) =>
      handler(...(args as EventArgs<T, H, E>));
    onCleanup(subscribe(hub, event, listener));
  }

  function useSignalRInvoke<H extends Hub, M extends MethodName<T, H>>(
    hub: H,
    method: M,
    options?: InvokeOptions,
  ) {
    const { waitForConnection, getConnection, acquire, release } =
      useInternalContext();
    useHubConsumer(hub);
    const scope = createAbortScope();
    onCleanup(() => {
      if (!options?.keepAliveOnUnmount) scope.abort();
    });

    return createInvoker<T, H, M>({
      target: { waitForConnection, getConnection, acquire, release },
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
    const { getConnection } = useInternalContext();
    useHubConsumer(hub);

    return createSender<T, H, M>({ getConnection, hub, method });
  }

  function useSignalRTeardown<H extends Hub, M extends MethodName<T, H>>(
    hub: H,
    method: M,
    options?: TeardownOptions,
  ) {
    const { acquire, release, waitForConnection } = useInternalContext();
    useHubConsumer(hub);

    return createTeardownSender<T, H, M>({
      target: { acquire, release, waitForConnection },
      hub,
      method,
      getOptions: () => options,
    });
  }

  return {
    useSignalR,
    useHubConsumer,
    useHubStatus,
    useOnReconnected,
    useSignalREffect,
    useSignalRInvoke,
    useSignalRSend,
    useSignalRTeardown,
  };
}
