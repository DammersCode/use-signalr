import type {
  SignalRContract,
  SignalRProviderPropsBase,
  SignalRContextValueBase,
  HubString,
} from "@dammers/use-signalr-core";
import type { Signal } from "@angular/core";
import type { StatusStore } from "./status-store.js";

/** A value, a zero-arg getter, or a `Signal`. Do not use a function type for `T`: it looks like a getter. */
export type MaybeSignal<T> = T | Signal<T> | (() => T);

export type TokenFactory = () => string | Promise<string>;

export type SignalROptions<THub extends HubString = HubString> = Omit<
  SignalRProviderPropsBase<THub>,
  "baseUrl" | "accessTokenFactory" | "enabled" | "connectionKey"
> & {
  /** Base URL of the SignalR server. The library adds the hub paths from the contract and removes a trailing slash. A new value rebuilds all connections. `undefined` or `""` disables the session. Use `"/"` for the same origin. */
  baseUrl: MaybeSignal<string | undefined>;
  /** Returns the bearer token. The library calls it on each negotiate and on each auto-reconnect attempt. Pass a plain factory or a `Signal` of one. A getter does not work, because it looks like the factory. */
  accessTokenFactory: TokenFactory | Signal<TokenFactory>;
  /**
   * When `false`, all hubs stop and the status is `idle`. An invoke that waits for the connection rejects at once with an error named `SignalRDisabledError`.
   * @default true
   */
  enabled?: MaybeSignal<boolean>;
  /** A new value rebuilds all connections. Use it to recover from `disconnected`. Pass a user ID or a login counter, not the token. */
  connectionKey?: MaybeSignal<string | number | undefined>;
};

export type SignalRContextValue<T extends SignalRContract> = SignalRContextValueBase<
  T,
  StatusStore<keyof T & HubString>
>;
