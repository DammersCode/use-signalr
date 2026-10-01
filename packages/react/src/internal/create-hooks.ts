import { use, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useLatest } from "../internal-hooks.js";
import {
  createAbortScope,
  createInvoker,
  createSender,
  createTeardownSender,
} from "@dammers/use-signalr-core";
import type { AbortScope } from "@dammers/use-signalr-core";
import type { Context } from "react";
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

const INITIAL_STATUS: HubConnectionStatus = "idle";

/** Builds the hooks bound to one client's context. */
export function createSignalRHooks<T extends SignalRContract>(
  ReactContext: Context<SignalRContextValue<T> | null>,
) {
  type Hub = keyof T & HubString;

  function useInternalContext() {
    const ctx = use(ReactContext);
    if (!ctx)
      throw new Error("useSignalR must be used within a SignalRProvider");
    return ctx;
  }

  function useSignalR(): SignalRPublicContext<T> {
    return useInternalContext().publicContext;
  }

  function useHubConsumer(hub: Hub) {
    const { acquire, release } = useInternalContext();
    useEffect(() => {
      acquire(hub);
      return () => release(hub);
    }, [hub, acquire, release]);
  }

  function useHubStatus<H extends Hub>(hub: H): HubConnectionStatus {
    const { statusStore } = useInternalContext();
    useHubConsumer(hub);
    const subscribe = useMemo(
      () => (listener: () => void) => statusStore.subscribe(hub, listener),
      [statusStore, hub],
    );
    return useSyncExternalStore(
      subscribe,
      () => statusStore.get(hub),
      () => INITIAL_STATUS,
    );
  }

  function useOnReconnected<H extends Hub>(hub: H, callback: () => void) {
    const { registerReconnect } = useInternalContext();
    useHubConsumer(hub);
    const cbRef = useLatest(callback);
    useEffect(
      () => registerReconnect(hub, () => cbRef.current()),
      [hub, registerReconnect, cbRef],
    );
  }

  function useSignalREffect<H extends Hub, E extends EventName<T, H>>(
    hub: H,
    event: E,
    handler: (...args: EventArgs<T, H, E>) => void,
  ) {
    const { subscribe } = useInternalContext();
    useHubConsumer(hub);
    const handlerRef = useLatest(handler);

    useEffect(
      () =>
        subscribe(hub, event, (...args) =>
          handlerRef.current(...(args as EventArgs<T, H, E>)),
        ),
      [hub, event, subscribe, handlerRef],
    );
  }

  function useSignalRInvoke<H extends Hub, M extends MethodName<T, H>>(
    hub: H,
    method: M,
    options?: InvokeOptions,
  ) {
    const { waitForConnection, getConnection, acquire, release } = useInternalContext();
    useHubConsumer(hub);
    const optsRef = useLatest(options);
    const scopeRef = useRef<AbortScope>(null);
    scopeRef.current ??= createAbortScope();
    const scope = scopeRef.current;
    useEffect(
      () => () => {
        if (!optsRef.current?.keepAliveOnUnmount) scope.abort();
      },
      [optsRef, scope],
    );

    return useMemo(
      () =>
        createInvoker<T, H, M>({
          target: { waitForConnection, getConnection, acquire, release },
          hub,
          method,
          getOptions: () => optsRef.current,
          getSignal: scope.signal,
        }),
      [waitForConnection, getConnection, acquire, release, hub, method, optsRef, scope],
    );
  }

  function useSignalRSend<H extends Hub, M extends MethodName<T, H>>(
    hub: H,
    method: M,
  ) {
    const { getConnection } = useInternalContext();
    useHubConsumer(hub);

    return useMemo(
      () => createSender<T, H, M>({ getConnection, hub, method }),
      [getConnection, hub, method],
    );
  }

  function useSignalRTeardown<H extends Hub, M extends MethodName<T, H>>(
    hub: H,
    method: M,
    options?: TeardownOptions,
  ) {
    const { acquire, release, waitForConnection } = useInternalContext();
    useHubConsumer(hub);
    const optsRef = useLatest(options);

    return useMemo(
      () =>
        createTeardownSender<T, H, M>({
          target: { acquire, release, waitForConnection },
          hub,
          method,
          getOptions: () => optsRef.current,
        }),
      [acquire, release, waitForConnection, hub, method, optsRef],
    );
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
