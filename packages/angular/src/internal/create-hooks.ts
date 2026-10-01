import { DestroyRef, assertInInjectionContext, inject } from "@angular/core";
import type { InjectionToken, Signal } from "@angular/core";
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

/** Builds the inject* functions bound to one client's context token. */
export function createSignalRHooks<T extends SignalRContract>(
  contextToken: InjectionToken<SignalRContextValue<T>>,
) {
  type Hub = keyof T & HubString;

  function injectSignalR(): SignalRPublicContext<T> {
    return injectInternalContext().publicContext;
  }

  function injectInternalContext() {
    assertInInjectionContext(injectSignalR);
    const ctx = inject(contextToken, { optional: true });
    if (!ctx) {
      throw new Error(
        "injectSignalR must be called in an injection context below provideSignalR",
      );
    }
    return ctx;
  }

  function injectKeepHubAlive(hub: Hub): void {
    assertInInjectionContext(injectKeepHubAlive);
    const { acquire, release } = injectInternalContext();
    inject(DestroyRef).onDestroy(() => release(hub));
    acquire(hub);
  }

  function injectHubStatus<H extends Hub>(hub: H): Signal<HubConnectionStatus> {
    assertInInjectionContext(injectHubStatus);
    const { statusStore } = injectInternalContext();
    injectKeepHubAlive(hub);
    return statusStore.signal(hub);
  }

  function injectOnReconnected<H extends Hub>(hub: H, callback: () => void): void {
    assertInInjectionContext(injectOnReconnected);
    const { registerReconnect } = injectInternalContext();
    let unsubscribe: (() => void) | undefined;
    inject(DestroyRef).onDestroy(() => unsubscribe?.());
    injectKeepHubAlive(hub);
    unsubscribe = registerReconnect(hub, () => callback());
  }

  function injectHubEvent<H extends Hub, E extends EventName<T, H>>(
    hub: H,
    event: E,
    handler: (...args: EventArgs<T, H, E>) => void,
  ): void {
    assertInInjectionContext(injectHubEvent);
    const { subscribe } = injectInternalContext();
    let unsubscribe: (() => void) | undefined;
    inject(DestroyRef).onDestroy(() => unsubscribe?.());
    injectKeepHubAlive(hub);
    unsubscribe = subscribe(hub, event, (...args) => handler(...(args as EventArgs<T, H, E>)));
  }

  function injectHubInvoke<H extends Hub, M extends MethodName<T, H>>(
    hub: H,
    method: M,
    options?: InvokeOptions,
  ) {
    assertInInjectionContext(injectHubInvoke);
    const { waitForConnection, getConnection, acquire, release } = injectInternalContext();
    injectKeepHubAlive(hub);
    const scope = createAbortScope();
    inject(DestroyRef).onDestroy(() => {
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

  function injectHubSend<H extends Hub, M extends MethodName<T, H>>(hub: H, method: M) {
    assertInInjectionContext(injectHubSend);
    const { getConnection } = injectInternalContext();
    injectKeepHubAlive(hub);

    return createSender<T, H, M>({ getConnection, hub, method });
  }

  function injectHubTeardown<H extends Hub, M extends MethodName<T, H>>(
    hub: H,
    method: M,
    options?: TeardownOptions,
  ) {
    assertInInjectionContext(injectHubTeardown);
    const { acquire, release, waitForConnection } = injectInternalContext();
    injectKeepHubAlive(hub);

    return createTeardownSender<T, H, M>({
      target: { acquire, release, waitForConnection },
      hub,
      method,
      getOptions: () => options,
    });
  }

  return {
    injectSignalR,
    injectKeepHubAlive,
    injectHubStatus,
    injectOnReconnected,
    injectHubEvent,
    injectHubInvoke,
    injectHubSend,
    injectHubTeardown,
  };
}
