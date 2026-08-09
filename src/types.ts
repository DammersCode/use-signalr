import type {
  HubConnection,
  HttpTransportType,
  IRetryPolicy,
  LogLevel,
} from "@microsoft/signalr";
import type { StatusStore } from "./status-store";

/** A hub path, for example `/hubs/chat`. */
export type HubString = `/${string}`;

/**
 * One hub's contract: the `events` the server pushes to you, and the
 * `methods` you invoke on the server. Both are optional.
 */
export interface HubContract {
  events?: Record<string, (...args: any[]) => void>;
  methods?: Record<string, (...args: any[]) => Promise<any>>;
}

/** The full app contract: a map of hub path to {events, methods}. */
export type SignalRContract = Record<HubString, HubContract>;

declare const ARGS: unique symbol;
/** Phantom-typed event declaration, created with {@link event}. */
export interface EventDef<A extends unknown[] = unknown[]> {
  readonly [ARGS]?: A;
}
declare const SIG: unique symbol;
/** Phantom-typed server-method declaration, created with {@link method}. */
export interface MethodDef<A extends unknown[] = unknown[], R = unknown> {
  readonly [SIG]?: [A, R];
}

/** Runtime per-hub definition: config plus event/method declarations. */
export interface HubDef extends PerHubConfig {
  events?: Record<string, EventDef<any>>;
  methods?: Record<string, MethodDef<any, any>>;
}

type InferEvents<E> = {
  [K in keyof E]: E[K] extends EventDef<infer A> ? (...args: A) => void : never;
};
type InferMethods<M> = {
  [K in keyof M]: M[K] extends MethodDef<infer A, infer R>
    ? (...args: A) => Promise<R>
    : never;
};

/** Derives the app contract ({@link SignalRContract}) from a runtime hub config. */
export type InferContract<H> = {
  [P in keyof H]: {
    events: InferEvents<H[P] extends { events?: infer E } ? NonNullable<E> : {}>;
    methods: InferMethods<H[P] extends { methods?: infer M } ? NonNullable<M> : {}>;
  };
};

/** Declares a server-pushed event, for example `event<[user: string, message: string]>()`. */
export function event<A extends unknown[] = []>(): EventDef<A> {
  return {} as EventDef<A>;
}

/** Declares an invocable server method, for example `method<[roomId: string], { success: boolean }>()`. */
export function method<A extends unknown[] = [], R = void>(): MethodDef<A, R> {
  return {} as MethodDef<A, R>;
}

// Contract index helpers. NonNullable<> is required because events/methods are
// optional — without it, `keyof (R | undefined)` collapses to `never` for every hub.

type Events<T, H extends keyof T> = NonNullable<
  T[H] extends { events?: infer E } ? E : never
>;
type Methods<T, H extends keyof T> = NonNullable<
  T[H] extends { methods?: infer M } ? M : never
>;

export type EventName<T, H extends keyof T> = keyof Events<T, H> & string;
export type MethodName<T, H extends keyof T> = keyof Methods<T, H> & string;

export type EventArgs<
  T,
  H extends keyof T,
  E extends EventName<T, H>,
> = Events<T, H>[E] extends (...args: infer A) => any ? A : never;

export type MethodArgs<
  T,
  H extends keyof T,
  M extends MethodName<T, H>,
> = Methods<T, H>[M] extends (...args: infer A) => any ? A : any[];

export type MethodReturn<
  T,
  H extends keyof T,
  M extends MethodName<T, H>,
> = Methods<T, H>[M] extends (...args: any[]) => Promise<infer R> ? R : unknown;

export type HubConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  /** Transient: fires once after a successful reconnect (not on the first connect). */
  | "reconnected";

/** Reconnect strategy: `true` for the library default, `false` for none, an
 *  array of retry delays in ms, or a custom policy. */
export type ReconnectConfig = boolean | number[] | IRetryPolicy;

/** Per-hub overrides. Anything omitted falls back to the global config. */
export interface PerHubConfig {
  /** Connect this hub only when first consumed; disconnect when the last
   *  consumer unmounts. Default: the global `lazy` (false). */
  lazy?: boolean;
  /** Grace period in ms before a lazy hub disconnects after its last consumer
   *  leaves. Avoids churn on quick remounts. Default 0. */
  graceMs?: number;
  /** Reconnect strategy. Default: the global value, else `true`. */
  reconnect?: ReconnectConfig;
  /** Connect retries before giving up. Default: the global value (2). */
  maxConnectRetries?: number;
  logLevel?: LogLevel;
  transport?: HttpTransportType;
  skipNegotiation?: boolean;
}

/** Config passed to `createSignalRClient(config)`. The keys of `hubs` are the
 *  hubs; each value's `events`/`methods` (declared with {@link event}/{@link method})
 *  are that hub's contract. */
export interface SignalRClientConfig<H extends Record<HubString, HubDef>> {
  /** One entry per hub. Each value is a {@link HubDef}: per-hub config plus
   *  its event/method declarations. */
  hubs: H;
  /** Global default: connect hubs only on demand. Default false — all
   *  configured hubs connect upfront. */
  lazy?: boolean;
  /** Global reconnect strategy. Default true. */
  reconnect?: ReconnectConfig;
  /** Global connect-retry budget. Default 2. */
  maxConnectRetries?: number;
  logLevel?: LogLevel;
}

/** Per-hub config with all defaults resolved. */
export interface ResolvedHubConfig {
  lazy: boolean;
  graceMs: number;
  reconnect: ReconnectConfig;
  maxConnectRetries: number;
  logLevel: LogLevel;
  transport?: HttpTransportType;
  skipNegotiation?: boolean;
  events: string[];
}

/** Options for an invoke call. */
export interface InvokeOptions {
  /**
   * Auto-retry count for RETRIABLE failures. Default 0 (fail fast).
   * Warning: invoke is at-least-once. A drop after the server processed the
   * call, but before its completion reaches the client, re-runs the call.
   * Set this above 0 only for IDEMPOTENT methods.
   */
  retries?: number;
  /** Per-attempt wait-for-connection plus invoke deadline in ms. Default 10_000. */
  timeout?: number;
  /** Backoff: fixed delays per attempt, or a fn(attempt) => ms. Capped at 30s
   *  and jittered. Default [250, 1000, 3000, 5000]. */
  backoff?: number[] | ((attempt: number) => number);
  /** Forces retriable or not. true = retry, false = throw now, undefined =
   *  the default rule. */
  isRetriable?: (error: unknown) => boolean | undefined;
  /**
   * Keeps an in-flight call alive when the calling component unmounts.
   * Default false: in-flight invokes are aborted on unmount, which is
   * correct for query-like reads. Set true for a method invoked in an effect
   * cleanup, so it still reaches the server. The detached call survives
   * unmount, but a still-pending retry loop is NOT cancelled. For the
   * connecting-race and lazy-hub case, use `useSignalRTeardown` instead.
   */
  keepAliveOnUnmount?: boolean;
}

/** Options for a `useSignalRTeardown` call. */
export interface TeardownOptions {
  /** Max time in ms to wait for the hub to (re)connect before giving up the
   *  flush. Default 10_000. */
  timeout?: number;
}

export interface SignalRProviderProps {
  children: React.ReactNode;
  /** Base URL of the SignalR server. Connections rebuild when this changes. */
  baseUrl: string | undefined;
  /** Returns the bearer token. Read on every (re)negotiate, so token rotation
   *  needs no connection rebuild. */
  accessTokenFactory: () => string | Promise<string>;
  /** When false, all connections stop and clear. Default true. */
  enabled?: boolean;
  /** Optional rebuild trigger. Pass the access token (or any value) to force a
   *  reconnect when it changes, for example on a re-login. */
  connectionKey?: string | number;
  onStatusChange?: (hub: HubString, status: HubConnectionStatus) => void;
  onError?: (hub: HubString, error: unknown) => void;
}

export interface SignalRContextValue<T extends SignalRContract> {
  getConnection: (hub: keyof T & HubString) => HubConnection | null;
  /** Non-reactive point read. Use `useHubStatus` to re-render on a change. */
  isHubConnected: (hub: keyof T & HubString) => boolean;
  /** Non-reactive point read. Use `useHubStatus` to re-render on a change. */
  getStatus: (hub: keyof T & HubString) => HubConnectionStatus;
  waitForConnection: (
    hub: keyof T & HubString,
    timeoutMs: number,
  ) => Promise<HubConnection>;
  /** Reactive status store for `useHubStatus`. */
  statusStore: StatusStore<keyof T & HubString>;
  /** Lazy ref-count: keeps a hub alive while a consumer is mounted. */
  acquire: (hub: keyof T & HubString) => void;
  release: (hub: keyof T & HubString) => void;
  /** Registers a reconnect callback for a hub. Returns an unsubscribe fn. */
  registerReconnect: (hub: keyof T & HubString, cb: () => void) => () => void;
}
