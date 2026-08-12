import {
  createInvoker,
  createSender,
  createSignalRSession,
  createTeardownSender,
  hubKeys,
  resolveHubConfig,
} from "@dammers/use-signalr-core";
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
import type { SignalRContextValue, SignalRSessionOptions } from "./types.js";

export function createSignalRClient<const H extends Record<HubString, HubDef>>(
  config: SignalRClientConfig<H>,
) {
  type T = InferContract<H>;
  type Hub = keyof T & HubString;

  const hubs = hubKeys(config);
  const resolved = new Map<Hub, ResolvedHubConfig>(
    hubs.map((hub) => [hub, resolveHubConfig(config, config.hubs[hub])]),
  );

  return {
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
  const statusStore = createStatusStore<Hub>();
  const session = createSignalRSession<T, typeof statusStore>({
    hubs,
    resolve,
    statusStore,
    getAccessToken: () => options.accessTokenFactory(),
    onStatusChange: (hub, status) => options.onStatusChange?.(hub, status),
    onError: (hub, error) => options.onError?.(hub, error),
  });
  let started = false;

  const ensureStarted = () => {
    if (started || options.enabled === false || !options.baseUrl) return;
    started = true;
    session.start(options.baseUrl);
  };

  function hub<H extends Hub>(
    host: ReactiveControllerHost,
    name: H,
    controllerOptions?: { reactiveStatus?: boolean },
  ) {
    return new HubController<T, H>(
      host,
      name,
      session.context,
      ensureStarted,
      controllerOptions?.reactiveStatus ?? false,
    );
  }

  return {
    hub,
    stop: () => {
      started = false;
      session.stop();
    },
    context: session.context,
  };
}

interface EventEntry {
  handler: (...args: unknown[]) => void;
  listener?: (...args: unknown[]) => void;
}

interface ReconnectEntry {
  callback: () => void;
  unsubscribe?: () => void;
}

class HubController<
  T extends SignalRContract,
  H extends keyof T & HubString,
> implements ReactiveController {
  private connected = false;
  private unsubscribeStatus?: () => void;
  private readonly reconnectEntries = new Set<ReconnectEntry>();
  private readonly activeInvokes = new Set<AbortController>();
  private readonly listeners = new Map<string, Set<EventEntry>>();

  constructor(
    private readonly host: ReactiveControllerHost,
    readonly hub: H,
    private readonly context: SignalRContextValue<T>,
    private readonly start: () => void,
    private readonly reactiveStatus: boolean,
  ) {
    host.addController(this);
  }

  get status(): HubConnectionStatus {
    return this.context.statusStore.get(this.hub);
  }

  hostConnected() {
    this.connected = true;
    this.start();
    this.context.acquire(this.hub);
    this.unsubscribeStatus = this.context.statusStore.subscribe(this.hub, () => {
      if (this.status === "connected") this.attachAll();
      else if (this.status !== "reconnected") this.detachAll();
      if (this.reactiveStatus) this.host.requestUpdate();
    });
    this.reconnectEntries.forEach((entry) => {
      entry.unsubscribe = this.context.registerReconnect(this.hub, entry.callback);
    });
    if (this.status === "connected") this.attachAll();
    if (this.reactiveStatus) this.host.requestUpdate();
  }

  hostDisconnected() {
    this.connected = false;
    this.unsubscribeStatus?.();
    this.unsubscribeStatus = undefined;
    this.reconnectEntries.forEach((entry) => {
      entry.unsubscribe?.();
      entry.unsubscribe = undefined;
    });
    this.activeInvokes.forEach((controller) => controller.abort());
    this.activeInvokes.clear();
    this.detachAll();
    this.context.release(this.hub);
  }

  on<E extends EventName<T, H>>(
    event: E,
    handler: (...args: EventArgs<T, H, E>) => void,
  ) {
    const entry: EventEntry = {
      handler: handler as (...args: unknown[]) => void,
    };
    let entries = this.listeners.get(String(event));
    if (!entries) this.listeners.set(String(event), (entries = new Set()));
    entries.add(entry);
    this.attach(event, entry);
    return () => {
      this.detach(event, entry);
      entries!.delete(entry);
      if (entries!.size === 0) this.listeners.delete(String(event));
    };
  }

  onReconnected(callback: () => void) {
    const entry: ReconnectEntry = { callback };
    this.reconnectEntries.add(entry);
    if (this.connected) {
      entry.unsubscribe = this.context.registerReconnect(this.hub, callback);
    }
    return () => {
      entry.unsubscribe?.();
      this.reconnectEntries.delete(entry);
    };
  }

  invoke<M extends MethodName<T, H>>(method: M, options?: InvokeOptions) {
    return createInvoker<T, H, M>(
      this.context,
      this.hub,
      method,
      () => options,
      (controller) => {
        if (!options?.keepAliveOnUnmount) this.activeInvokes.add(controller);
      },
      (controller) => this.activeInvokes.delete(controller),
    );
  }

  send<M extends MethodName<T, H>>(method: M) {
    return createSender<T, H, M>(this.context.getConnection, this.hub, method);
  }

  teardown<M extends MethodName<T, H>>(
    method: M,
    options?: TeardownOptions,
  ) {
    return createTeardownSender<T, H, M>(
      this.context,
      this.hub,
      method,
      () => options,
    );
  }

  private attachAll() {
    this.listeners.forEach((entries, event) =>
      entries.forEach((entry) => this.attach(event, entry)),
    );
  }

  private attach(event: string, entry: EventEntry) {
    this.detach(event, entry);
    if (!this.connected || this.status !== "connected") return;
    const connection = this.context.getConnection(this.hub);
    if (!connection) return;
    entry.listener = (...args) => entry.handler(...args);
    connection.on(event, entry.listener);
  }

  private detachAll() {
    this.listeners.forEach((entries, event) =>
      entries.forEach((entry) => this.detach(event, entry)),
    );
  }

  private detach(event: string, entry: EventEntry) {
    if (!entry.listener) return;
    this.context.getConnection(this.hub)?.off(event, entry.listener);
    entry.listener = undefined;
  }
}
