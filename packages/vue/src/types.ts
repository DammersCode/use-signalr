import type { MaybeRefOrGetter } from "vue";
import type {
  HubString,
  SignalRContract,
  SignalRContextValueBase,
  SignalRProviderPropsBase,
} from "@dammers/use-signalr-core";
import type { StatusStore } from "./status-store.js";

export type { MaybeRefOrGetter } from "vue";

export type SignalROptions<THub extends HubString = HubString> = Omit<
  SignalRProviderPropsBase<THub>,
  "baseUrl" | "enabled" | "connectionKey"
> & {
  /** Base URL of the SignalR server. The library adds the hub paths from the contract and removes a trailing slash. A new value rebuilds all connections. `undefined` or `""` disables the session. Use `"/"` for the same origin. */
  baseUrl: MaybeRefOrGetter<string | undefined>;
  /**
   * When `false`, all hubs stop and the status is `idle`. An invoke that waits for the connection rejects at once with an error named `SignalRDisabledError`.
   * @default true
   */
  enabled?: MaybeRefOrGetter<boolean>;
  /** A new value rebuilds all connections. Use it to recover from `disconnected`. Pass a user ID or a login counter, not the token. */
  connectionKey?: MaybeRefOrGetter<string | number | undefined>;
};

export type SignalRContextValue<T extends SignalRContract> = SignalRContextValueBase<
  T,
  StatusStore<keyof T & HubString>
>;
