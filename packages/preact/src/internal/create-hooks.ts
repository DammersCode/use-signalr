import { useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { createAbortScope, createInvoker, createSender, createTeardownSender } from "@dammers/use-signalr-core";
import type { AbortScope } from "@dammers/use-signalr-core";
import type { Context } from "preact";
import type { EventArgs, EventName, HubConnectionStatus, HubString, InvokeOptions, MethodName, SignalRContract, SignalRPublicContext, TeardownOptions } from "@dammers/use-signalr-core";
import { useLatest } from "../internal-hooks.js";
import type { SignalRContextValue } from "../types.js";

export function createSignalRHooks<T extends SignalRContract>(Context: Context<SignalRContextValue<T> | null>) {
  type Hub = keyof T & HubString;
  function useInternalContext() {
    const context = useContext(Context);
    if (!context) throw new Error("useSignalR must be used within a SignalRProvider");
    return context;
  }
  /** Last-resort access to `getConnection`, `getStatus`, and `waitForConnection`. */
  function useSignalR(): SignalRPublicContext<T> {
    return useInternalContext().publicContext;
  }
  function useHubConsumer<H extends Hub>(hub: H) {
    const { acquire, release } = useInternalContext();
    useEffect(() => { acquire(hub); return () => release(hub); }, [hub, acquire, release]);
  }
  function useHubStatus<H extends Hub>(hub: H): HubConnectionStatus {
    const { statusStore } = useInternalContext();
    useHubConsumer(hub);
    const [state, setState] = useState(() => ({ hub, status: statusStore.get(hub) }));
    useEffect(() => {
      const sync = () => setState((prev) => {
        const status = statusStore.get(hub);
        return prev.hub === hub && prev.status === status ? prev : { hub, status };
      });
      sync();
      return statusStore.subscribe(hub, sync);
    }, [hub, statusStore]);
    return state.hub === hub ? state.status : statusStore.get(hub);
  }
  function useOnReconnected<H extends Hub>(hub: H, callback: () => void) {
    const { registerReconnect } = useInternalContext();
    useHubConsumer(hub);
    const latest = useLatest(callback);
    useEffect(() => registerReconnect(hub, () => latest.current()), [hub, registerReconnect, latest]);
  }
  function useSignalREffect<H extends Hub, E extends EventName<T, H>>(hub: H, event: E, handler: (...args: EventArgs<T, H, E>) => void) {
    const { subscribe } = useInternalContext();
    useHubConsumer(hub);
    const latest = useLatest(handler);
    useEffect(
      () => subscribe(hub, event, (...args) => latest.current(...(args as EventArgs<T, H, E>))),
      [hub, event, subscribe, latest],
    );
  }
  function useSignalRInvoke<H extends Hub, M extends MethodName<T, H>>(hub: H, method: M, options?: InvokeOptions) {
    const { waitForConnection, getConnection, acquire, release } = useInternalContext();
    useHubConsumer(hub);
    const latest = useLatest(options);
    const scopeRef = useRef<AbortScope | null>(null);
    scopeRef.current ??= createAbortScope();
    const scope = scopeRef.current;
    useEffect(() => () => { if (!latest.current?.keepAliveOnUnmount) scope.abort(); }, [latest, scope]);
    return useMemo(() => createInvoker<T, H, M>({ target: { waitForConnection, getConnection, acquire, release }, hub, method, getOptions: () => latest.current, getSignal: scope.signal }), [waitForConnection, getConnection, acquire, release, hub, method, latest, scope]);
  }
  function useSignalRSend<H extends Hub, M extends MethodName<T, H>>(hub: H, method: M) {
    const { getConnection } = useInternalContext();
    useHubConsumer(hub);
    return useMemo(() => createSender<T, H, M>({ getConnection, hub, method }), [getConnection, hub, method]);
  }
  function useSignalRTeardown<H extends Hub, M extends MethodName<T, H>>(hub: H, method: M, options?: TeardownOptions) {
    const { acquire, release, waitForConnection } = useInternalContext();
    useHubConsumer(hub);
    const latest = useLatest(options);
    return useMemo(() => createTeardownSender<T, H, M>({ target: { acquire, release, waitForConnection }, hub, method, getOptions: () => latest.current }), [acquire, release, waitForConnection, hub, method, latest]);
  }
  return { useSignalR, useHubConsumer, useSignalREffect, useSignalRInvoke, useSignalRSend, useSignalRTeardown, useHubStatus, useOnReconnected };
}
