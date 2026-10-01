import { getContext, onDestroy } from "svelte";
import type { Readable } from "svelte/store";
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

/** Builds the functions bound to one client's context. */
export function createSignalRHooks<T extends SignalRContract>(contextKey: symbol) {
  type Hub = keyof T & HubString;

  function getInternalContext(name: string) {
    const ctx = getContext<SignalRContextValue<T> | undefined>(contextKey);
    if (!ctx)
      throw new Error(`${name} must be called during component init, below provideSignalR`);
    return ctx;
  }

  function getSignalR(): SignalRPublicContext<T> {
    return getInternalContext("getSignalR").publicContext;
  }

  function keepHubAlive(hub: Hub) {
    const { acquire, release } = getInternalContext("keepHubAlive");
    acquire(hub);
    onDestroy(() => release(hub));
  }

  function hubStatus<H extends Hub>(hub: H): Readable<HubConnectionStatus> {
    const { statusStore } = getInternalContext("hubStatus");
    keepHubAlive(hub);
    return statusStore.readable(hub);
  }

  function onReconnected<H extends Hub>(hub: H, callback: () => void) {
    const { registerReconnect } = getInternalContext("onReconnected");
    keepHubAlive(hub);
    const unsub = registerReconnect(hub, () => callback());
    onDestroy(unsub);
  }

  function onHubEvent<H extends Hub, E extends EventName<T, H>>(
    hub: H,
    event: E,
    handler: (...args: EventArgs<T, H, E>) => void,
  ) {
    const { subscribe } = getInternalContext("onHubEvent");
    keepHubAlive(hub);
    const unsubscribe = subscribe(hub, event, (...args) =>
      handler(...(args as EventArgs<T, H, E>)),
    );
    onDestroy(unsubscribe);
  }

  function hubInvoke<H extends Hub, M extends MethodName<T, H>>(
    hub: H,
    method: M,
    options?: InvokeOptions,
  ) {
    const { waitForConnection, getConnection, acquire, release } = getInternalContext("hubInvoke");
    keepHubAlive(hub);
    const scope = createAbortScope();
    onDestroy(() => {
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

  function hubSend<H extends Hub, M extends MethodName<T, H>>(hub: H, method: M) {
    const { getConnection } = getInternalContext("hubSend");
    keepHubAlive(hub);

    return createSender<T, H, M>({ getConnection, hub, method });
  }

  function hubTeardown<H extends Hub, M extends MethodName<T, H>>(
    hub: H,
    method: M,
    options?: TeardownOptions,
  ) {
    const { acquire, release, waitForConnection } = getInternalContext("hubTeardown");
    keepHubAlive(hub);

    return createTeardownSender<T, H, M>({
      target: { acquire, release, waitForConnection },
      hub,
      method,
      getOptions: () => options,
    });
  }

  return {
    getSignalR,
    keepHubAlive,
    hubStatus,
    onReconnected,
    onHubEvent,
    hubInvoke,
    hubSend,
    hubTeardown,
  };
}
