import type {
  HubConnectionBuilder,
  IHttpConnectionOptions,
  IHubProtocol,
  IRetryPolicy,
  LogLevel,
} from "@microsoft/signalr";

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

// NonNullable: optional events/methods would collapse `keyof` to `never`.

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
> = Methods<T, H>[M] extends (...args: infer A) => any ? A : never;

export type MethodReturn<
  T,
  H extends keyof T,
  M extends MethodName<T, H>,
> = Methods<T, H>[M] extends (...args: any[]) => Promise<infer R> ? R : unknown;

export type HubConnectionStatus =
  /** No connection is wanted: not started, disabled, stopped, or a lazy hub with no consumer. */
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  /** The connection is wanted but down after a non-retriable error. */
  | "disconnected";

/** Says where an `onError` error came from. */
export interface SignalRErrorInfo {
  /** `"connection"`: connect, negotiate, build, close, or protocol errors.
   *  `"callback"`: an error that your event handler, reconnect callback, or
   *  `onStatusChange` throws or rejects with. */
  source: "connection" | "callback";
}

/** Reconnect strategy: `true` for the library default, `false` for none, an
 *  array of retry delays in ms, or a custom policy. `false` turns off SignalR
 *  auto-reconnect only. The library still rebuilds a lost connection with its own delays. */
export type ReconnectConfig = boolean | number[] | IRetryPolicy;

/** Options for the SignalR HTTP connection. The library owns `accessTokenFactory`. */
export type HttpOptions = Omit<IHttpConnectionOptions, "accessTokenFactory">;

/** A hub protocol, or a factory that the library calls once per connection build. */
export type HubProtocolConfig = IHubProtocol | (() => IHubProtocol);

/** Context for {@link ConfigureBuilder}. */
export interface BuilderContext {
  hub: HubString;
  baseUrl: string;
}

/** Changes the connection builder. It must return the builder to use. */
export type ConfigureBuilder = (
  builder: HubConnectionBuilder,
  ctx: BuilderContext,
) => HubConnectionBuilder;

/** Per-hub overrides. The global value is the fallback for each option that you omit. */
export interface PerHubConfig {
  /**
   * Connect this hub when its first consumer appears, and disconnect when the last consumer leaves. Falls back to the global `lazy`.
   */
  lazy?: boolean;
  /**
   * Time in ms that a lazy hub stays connected after its last consumer leaves. This option exists only per hub.
   * @default 0
   */
  graceMs?: number;
  /**
   * The reconnect strategy of SignalR. `true` uses the SignalR default delays of 0, 2, 10, and 30 seconds. `false` turns off SignalR auto-reconnect only. The library still rebuilds a lost connection. Falls back to the global `reconnect`, else `true`.
   */
  reconnect?: ReconnectConfig;
  /**
   * The log level of the SignalR client for this hub. Falls back to the global `logLevel`, else `LogLevel.Information`.
   */
  logLevel?: LogLevel;
  /**
   * Merged over the global `httpOptions`. The per-hub key wins. `headers` merge by name.
   */
  httpOptions?: HttpOptions;
  /**
   * The hub protocol, for example `() => new MessagePackHubProtocol()`. The per-hub value wins. Falls back to the global `hubProtocol`, else JSON.
   */
  hubProtocol?: HubProtocolConfig;
  /** Runs on every connection build, after the library's own builder calls. The global hook runs first, then this hook. */
  configureBuilder?: ConfigureBuilder;
}

/** Maps every key that a hub definition does not declare to `never`. */
type NoUnknownHubKeys<H> = {
  [P in keyof H]: { [K in Exclude<keyof H[P], keyof HubDef>]: never };
};

/** Config that you pass to `createSignalRClient`. These are the global defaults for all hubs. */
export interface SignalRClientConfig<H extends Record<HubString, HubDef>> {
  /**
   * One entry per hub. The key is the hub path, such as `/hubs/rooms`. The value holds the hub config and its `events` and `methods`. Unknown keys are a type error.
   * @remarks `Record<HubString, HubDef>`
   */
  hubs: H & NoUnknownHubKeys<H>;
  /**
   * Connect hubs only when a consumer first uses them. By default, all configured hubs connect at the start.
   * @default false
   */
  lazy?: boolean;
  /**
   * The reconnect strategy of SignalR. `true` uses the SignalR default delays of 0, 2, 10, and 30 seconds. `false` turns off SignalR auto-reconnect only. The library still rebuilds a lost connection.
   * @default true
   */
  reconnect?: ReconnectConfig;
  /**
   * The log level of the SignalR client.
   * @default LogLevel.Information
   */
  logLevel?: LogLevel;
  /**
   * Options for the HTTP connection, such as `headers` and `transport`. The library sets `accessTokenFactory`, so it is not part of the type.
   * @default {}
   */
  httpOptions?: HttpOptions;
  /**
   * The hub protocol, for example `() => new MessagePackHubProtocol()`. A factory runs once for each connection build.
   * @default new JsonHubProtocol()
   */
  hubProtocol?: HubProtocolConfig;
  /** Runs on every connection build, after the library's own builder calls. Return the builder to use. */
  configureBuilder?: ConfigureBuilder;
}

/** Per-hub config with all defaults resolved. `resolve` returns the result of `resolveHubConfig`. The shape can grow. */
export interface ResolvedHubConfig {
  lazy: boolean;
  graceMs: number;
  reconnect: ReconnectConfig;
  logLevel: LogLevel;
  httpOptions: HttpOptions;
  hubProtocol: HubProtocolConfig | undefined;
  /** The global hook first, then the per-hub hook. */
  configureBuilders: ConfigureBuilder[];
  events: string[];
}

/** Options for an invoke call. */
export interface InvokeOptions {
  /**
   * Number of retries for retriable failures. A retry can run the call twice, so use it only for idempotent methods.
   * @default 0
   */
  retries?: number;
  /**
   * Maximum wait in ms for the connection, for each attempt. It does not limit the invoke itself. `Infinity` waits without a limit. A value above 2^31-1 is clamped to 2^31-1.
   * @default 10000
   */
  timeout?: number;
  /**
   * The delay in ms before each retry. The last array value repeats. A function gets the attempt number, starting at 0. The cap is 30 seconds, and the delay has a jitter of 50 to 100 percent.
   * @default [250, 1000, 3000, 5000]
   */
  backoff?: number[] | ((attempt: number) => number);
  /** `true` retries, `false` throws at once, `undefined` uses the default rule. */
  isRetriable?: (error: unknown) => boolean | undefined;
  /**
   * If `true`, a teardown does not abort the wait or the retry delays, and the call holds a lazy hub open until it settles. If `false`, a teardown aborts them with an `AbortError`. A call that was already sent finishes in both cases.
   * @default false
   */
  keepAliveOnUnmount?: boolean;
}

/** Options for a teardown send. */
export interface TeardownOptions {
  /**
   * Maximum time in ms to wait for the hub to connect before the library gives up the send.
   * @default 10000
   */
  timeout?: number;
}
