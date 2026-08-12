import { useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { createAbortScope, createInvoker, createSender, createTeardownSender } from "@dammers/use-signalr-core";
import type { AbortScope } from "@dammers/use-signalr-core";
import type { Context } from "preact";
import type { EventArgs, EventName, HubConnectionStatus, HubString, InvokeOptions, MethodName, SignalRContract, TeardownOptions } from "@dammers/use-signalr-core";
import { useLatest } from "../internal-hooks.js";
import type { SignalRContextValue } from "../types.js";

export function createSignalRHooks<T extends SignalRContract>(Context: Context<SignalRContextValue<T> | null>) {
  type Hub = keyof T & HubString;
  function useSignalR() {
    const context = useContext(Context);
    if (!context) throw new Error("useSignalR must be used within a SignalRProvider");
    return context;
  }
  function useHubConsumer<H extends Hub>(hub: H) {
    const { acquire, release } = useSignalR();
    useEffect(() => { acquire(hub); return () => release(hub); }, [hub, acquire, release]);
  }
  function useHubStatus<H extends Hub>(hub: H): HubConnectionStatus {
    const { statusStore } = useSignalR();
    useHubConsumer(hub);
    const [status, setStatus] = useState(() => statusStore.get(hub));
    useEffect(() => {
      setStatus(statusStore.get(hub));
      return statusStore.subscribe(hub, () => setStatus(statusStore.get(hub)));
    }, [hub, statusStore]);
    return status;
  }
  function useOnReconnected<H extends Hub>(hub: H, callback: () => void) {
    const { registerReconnect } = useSignalR();
    useHubConsumer(hub);
    const latest = useLatest(callback);
    useEffect(() => registerReconnect(hub, () => latest.current()), [hub, registerReconnect, latest]);
  }
  function useSignalREffect<H extends Hub, E extends EventName<T, H>>(hub: H, event: E, handler: (...args: EventArgs<T, H, E>) => void) {
    const { getConnection } = useSignalR();
    const status = useHubStatus(hub);
    const latest = useLatest(handler);
    useEffect(() => {
      const connection = getConnection(hub);
      if (!connection || status !== "connected") return;
      const listener = (...args: unknown[]) => latest.current(...(args as EventArgs<T, H, E>));
      connection.on(event, listener);
      return () => connection.off(event, listener);
    }, [hub, event, status, getConnection, latest]);
  }
  function useSignalRInvoke<H extends Hub, M extends MethodName<T, H>>(hub: H, method: M, options?: InvokeOptions) {
    const { waitForConnection, getConnection } = useSignalR();
    useHubConsumer(hub);
    const latest = useLatest(options);
    const scopeRef = useRef<AbortScope | null>(null);
    scopeRef.current ??= createAbortScope();
    const scope = scopeRef.current;
    useEffect(() => () => { if (!latest.current?.keepAliveOnUnmount) scope.abortAll(); }, [latest, scope]);
    return useMemo(() => createInvoker<T, H, M>({ waitForConnection, getConnection }, hub, method, () => latest.current, scope.track, scope.untrack), [waitForConnection, getConnection, hub, method, latest, scope]);
  }
  function useSignalRSend<H extends Hub, M extends MethodName<T, H>>(hub: H, method: M) {
    const { getConnection } = useSignalR();
    useHubConsumer(hub);
    return useMemo(() => createSender<T, H, M>(getConnection, hub, method), [getConnection, hub, method]);
  }
  function useSignalRTeardown<H extends Hub, M extends MethodName<T, H>>(hub: H, method: M, options?: TeardownOptions) {
    const { acquire, release, waitForConnection } = useSignalR();
    useHubConsumer(hub);
    const latest = useLatest(options);
    return useMemo(() => createTeardownSender<T, H, M>({ acquire, release, waitForConnection }, hub, method, () => latest.current), [acquire, release, waitForConnection, hub, method, latest]);
  }
  return { useSignalR, useHubConsumer, useSignalREffect, useSignalRInvoke, useSignalRSend, useSignalRTeardown, useHubStatus, useOnReconnected };
}
