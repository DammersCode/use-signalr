import {
  createAbortScope,
  createInvoker,
  createSender,
  createSignalRSession,
  createTeardownSender,
  hubKeys,
  resolveHubConfig,
} from "@dammers/use-signalr-core";
import { isServer } from "lit";
import type { ReactiveController, ReactiveControllerHost } from "lit";
import type {
  EventArgs,
  EventName,
  HubConnectionStatus,
  HubDef,
  HubString,
  InferContract,
  InvokeOptions,
  MethodName,
  ResolvedHubConfig,
  SignalRClientConfig,
  SignalRContract,
  TeardownOptions,
} from "@dammers/use-signalr-core";
import { createStatusStore } from "./status-store.js";
import type {
  SignalRContextValue,
  SignalRSessionOptions,
  SignalRSessionUpdate,
} from "./types.js";

/** Creates a typed SignalR client. Call `createSession` once to get a session for your app. */
export function createSignalRClient<const H extends Record<HubString, HubDef>>(
  config: SignalRClientConfig<H>,
) {
  type T = InferContract<H>;
  type Hub = keyof T & HubString;

  const hubs = hubKeys(config);
  const resolved = new Map<Hub, ResolvedHubConfig>(
    hubs.map((hub) => [hub, resolveHubConfig(config, hub)]),
  );

  return {
    /** Builds a session that starts, retries, and reconnects every configured hub. It starts when the first host connects. Pass `baseUrl` and `accessTokenFactory`, and gate them with `enabled`. */
    createSession(options: SignalRSessionOptions<Hub>) {
      return createRuntime<T>(hubs, (hub) => resolved.get(hub)!, options);
    },
  };
}

function createRuntime<T extends SignalRContract>(
  hubs: Array<keyof T & HubString>,
  resolve: (hub: keyof T & HubString) => ResolvedHubConfig,
  options: SignalRSessionOptions<keyof T & HubString>,
) {
  type Hub = keyof T & HubString;
  let values = { ...options };
  let stopped = false;
  let hasHost = false;
  const statusStore = createStatusStore<Hub>();
  const session = createSignalRSession<T, typeof statusStore>({
    hubs,
    resolve,
    statusStore,
    getAccessToken: () => values.accessTokenFactory(),
    onStatusChange: (hub, status) => options.onStatusChange?.(hub, status),
    onError: (hub, error, info) => options.onError?.(hub, error, info),
  });
  const sync = () => {
    if (stopped) return;
    session.update({
      baseUrl: values.baseUrl,
      enabled: values.enabled,
      connectionKey: values.connectionKey,
    });
  };

  function hub<H extends Hub>(
    host: ReactiveControllerHost,
    name: H,
    controllerOptions?: {
      /** Set to `false` to not request a host update on each status change. The default is `true`. */
      reactiveStatus?: boolean;
    },
  ) {
    return new HubController<T, H>(
      host,
      name,
      session.context,
      () => {
        hasHost = true;
        sync();
      },
      controllerOptions?.reactiveStatus ?? true,
    );
  }

  return {
    /** Creates a `HubController` for one hub on a Lit host. The hub connects while the host is connected. */
    hub,
    /** Changes session options, for example a new `baseUrl` or `enabled`. Values set before the first host connects apply when it connects. It restarts a stopped session. An `undefined` `accessTokenFactory` keeps the old one. */
    update: (partial: SignalRSessionUpdate) => {
      const { accessTokenFactory, ...rest } = partial;
      values = { ...values, ...rest, ...(accessTokenFactory && { accessTokenFactory }) };
      stopped = false;
      if (hasHost) sync();
    },
    /** Stops every hub and releases the connections. The session stays stopped until the next `update()`. */
    stop: () => {
      stopped = true;
      session.stop();
    },
    /** Escape hatch to the SignalR context (`getConnection`, `getStatus`, and `waitForConnection`). Use this only for the underlying `HubConnection` or a point read. */
    context: session.publicContext,
  };
}

interface EventEntry {
  event: string;
  handle: (...args: unknown[]) => void;
  unsubscribe?: () => void;
}

interface ReconnectEntry {
  run: () => void;
  unsubscribe?: () => void;
}

export type LitSignalRSession<T extends SignalRContract> = ReturnType<
  typeof createRuntime<T>
>;

export class HubController<
  T extends SignalRContract,
  H extends keyof T & HubString,
> implements ReactiveController {
  private connected = false;
  private unsubscribeStatus?: () => void;
  private readonly reconnectEntries = new Set<ReconnectEntry>();
  private readonly abortScope = createAbortScope();
  private readonly eventEntries = new Set<EventEntry>();

  constructor(
    private readonly host: ReactiveControllerHost,
    /** Name of the hub this controller uses. */
    readonly hub: H,
    private readonly context: SignalRContextValue<T>,
    private readonly start: () => void,
    private readonly reactiveStatus: boolean,
  ) {
    host.addController(this);
  }

  /** Live connection status of the hub. Requests a host update on each change unless `reactiveStatus` is `false`. */
  get status(): HubConnectionStatus {
    return this.context.statusStore.get(this.hub);
  }

  /** Lit calls this when the host connects. It acquires the hub, and does nothing during a server render. */
  hostConnected() {
    if (isServer || this.connected) return;
    this.connected = true;
    this.start();
    this.context.acquire(this.hub);
    if (this.reactiveStatus) {
      this.unsubscribeStatus = this.context.statusStore.subscribe(this.hub, () =>
        this.host.requestUpdate(),
      );
      this.host.requestUpdate();
    }
    this.eventEntries.forEach((entry) => this.subscribeEntry(entry));
    this.reconnectEntries.forEach((entry) => {
      entry.unsubscribe = this.context.registerReconnect(this.hub, entry.run);
    });
  }

  /** Lit calls this when the host disconnects. Pending calls abort at the end of the task, unless the host connects again first. */
  hostDisconnected() {
    if (!this.connected) return;
    this.connected = false;
    this.unsubscribeStatus?.();
    this.unsubscribeStatus = undefined;
    this.eventEntries.forEach((entry) => this.unsubscribeEntry(entry));
    this.reconnectEntries.forEach((entry) => {
      entry.unsubscribe?.();
      entry.unsubscribe = undefined;
    });
    queueMicrotask(() => {
      if (!this.connected) this.abortScope.abort();
    });
    this.context.release(this.hub);
  }

  /** Disconnects the controller and removes it from the host. */
  dispose() {
    this.hostDisconnected();
    this.host.removeController(this);
  }

  /** Subscribes to a typed server event while the host is connected. Handler args are inferred from your contract. Returns an unsubscribe function. */
  on<E extends EventName<T, H>>(
    event: E,
    handler: (...args: EventArgs<T, H, E>) => void,
  ) {
    const entry: EventEntry = {
      event: String(event),
      handle: (...args) => handler(...(args as EventArgs<T, H, E>)),
    };
    this.eventEntries.add(entry);
    if (this.connected) this.subscribeEntry(entry);
    return () => {
      this.unsubscribeEntry(entry);
      this.eventEntries.delete(entry);
    };
  }

  /** Runs a callback after each reconnect, not the first connect, to refetch state that went stale while offline. */
  onReconnected(callback: () => void) {
    const entry: ReconnectEntry = { run: () => callback() };
    this.reconnectEntries.add(entry);
    if (this.connected) {
      entry.unsubscribe = this.context.registerReconnect(this.hub, entry.run);
    }
    return () => {
      entry.unsubscribe?.();
      this.reconnectEntries.delete(entry);
    };
  }

  /** Typed invoker that waits for the connection and resolves with the method's return value. Fails fast by default. Opt in to retry for idempotent methods only. */
  invoke<M extends MethodName<T, H>>(method: M, options?: InvokeOptions) {
    return createInvoker<T, H, M>({
      target: this.context,
      hub: this.hub,
      method,
      getOptions: () => options,
      getSignal: () => (options?.keepAliveOnUnmount ? undefined : this.abortScope.signal()),
    });
  }

  /** Typed fire-and-forget sender. It does not wait for the connection. It resolves `true` when it sends the call, and `false` when the hub is not connected and it drops the call. It never throws, so a cleanup can call it. For a call that must land in a cleanup, use `teardown`. */
  send<M extends MethodName<T, H>>(method: M) {
    return createSender<T, H, M>({
      getConnection: this.context.getConnection,
      hub: this.hub,
      method,
    });
  }

  /** Typed teardown sender for a method invoked in a cleanup. Survives host disconnect, queues while the hub is still connecting, and holds a lazy hub open until the flush completes. Never throws. */
  teardown<M extends MethodName<T, H>>(
    method: M,
    options?: TeardownOptions,
  ) {
    return createTeardownSender<T, H, M>({
      target: this.context,
      hub: this.hub,
      method,
      getOptions: () => options,
    });
  }

  private subscribeEntry(entry: EventEntry) {
    this.unsubscribeEntry(entry);
    entry.unsubscribe = this.context.subscribe(this.hub, entry.event, entry.handle);
  }

  private unsubscribeEntry(entry: EventEntry) {
    entry.unsubscribe?.();
    entry.unsubscribe = undefined;
  }
}
