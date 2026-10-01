import type { HubConnection } from "@microsoft/signalr";
import type {
  HubConnectionStatus,
  HubString,
  SignalRContract,
  SignalRErrorInfo,
} from "./types.js";

export interface SignalRProviderPropsBase<THub extends string = HubString> {
  /** Base URL of the SignalR server. The library adds the hub paths from the contract and removes a trailing slash. A new value rebuilds all connections. `undefined` or `""` disables the session. Use `"/"` for the same origin. */
  baseUrl: string | undefined;
  /** Returns the bearer token. The library calls it on each negotiate and on each auto-reconnect attempt. A token change needs no rebuild. */
  accessTokenFactory: () => string | Promise<string>;
  /**
   * When `false`, all hubs stop and the status is `idle`. An invoke that waits for the connection rejects at once with an error named `SignalRDisabledError`.
   * @default true
   */
  enabled?: boolean;
  /** A new value rebuilds all connections. Use it to recover from `disconnected`. Pass a user ID or a login counter, not the token. */
  connectionKey?: string | number;
  /** Runs when the status of a hub changes. */
  onStatusChange?: (hub: THub, status: HubConnectionStatus) => void;
  /** Runs on a connection error and on an error that your callback throws. `info.source` is `"connection"` or `"callback"`. */
  onError?: (hub: THub, error: unknown, info: SignalRErrorInfo) => void;
}

/** The small context the public accessor of each adapter returns. */
export interface SignalRPublicContext<T extends SignalRContract> {
  /** The live `HubConnection` of the hub, or `null` when none exists. */
  getConnection: (hub: keyof T & HubString) => HubConnection | null;
  /** Point read of the hub's current status. In a reactive scope of a signal-based framework (Solid, Vue, Angular), the read tracks. */
  getStatus: (hub: keyof T & HubString) => HubConnectionStatus;
  /**
   * Resolves once the hub is connected. Waits across stop, start, and rebuilds.
   * Rejects after `timeoutMs`, or with `signal.reason` (an `AbortError` for a plain `abort()`) when `signal` aborts.
   * Rejects at once when the last update disabled the session, or when the hub stopped after a non-retriable error.
   * On the server no connection starts. The wait rejects at once if the adapter disables the session there, and ends with the timeout otherwise.
   */
  waitForConnection: (
    hub: keyof T & HubString,
    timeoutMs: number,
    signal?: AbortSignal,
  ) => Promise<HubConnection>;
}

/** The full context that adapters use inside their own hooks. Not public API. */
export interface SignalRContextValueBase<T extends SignalRContract, TStore>
  extends SignalRPublicContext<T> {
  /** The frozen object that the public accessor returns. */
  publicContext: SignalRPublicContext<T>;
  /** The store that you passed to the session. */
  statusStore: TStore;
  /** Raises the lazy reference count of a hub. A lazy hub stays connected while the count is above 0. */
  acquire: (hub: keyof T & HubString) => void;
  /** Lowers the lazy reference count of a hub. */
  release: (hub: keyof T & HubString) => void;
  /** Registers a callback that runs after each reconnect, not after the first connect. Returns an unsubscribe function. */
  registerReconnect: (hub: keyof T & HubString, cb: () => void) => () => void;
  /** Registers an event handler. The handler survives rebuilds. Returns an unsubscribe function. */
  subscribe: (
    hub: keyof T & HubString,
    event: string,
    handler: (...args: unknown[]) => void,
  ) => () => void;
}
