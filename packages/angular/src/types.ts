import type {
  SignalRContract,
  SignalRProviderPropsBase,
  SignalRContextValueBase,
  HubString,
} from "@dammers/use-signalr-core";
import type { Signal } from "@angular/core";
import type { StatusStore } from "./status-store.js";

/** A value that can also be supplied as a zero-arg getter or a `Signal`, to
 *  make `provideSignalR` react to it (token rotation, enable/disable). */
export type MaybeSignal<T> = T | Signal<T> | (() => T);

export type SignalROptions = Omit<
  SignalRProviderPropsBase<never>,
  "children" | "baseUrl" | "accessTokenFactory" | "enabled" | "connectionKey"
> & {
  baseUrl: MaybeSignal<string | undefined>;
  accessTokenFactory: MaybeSignal<() => string | Promise<string>>;
  enabled?: MaybeSignal<boolean>;
  connectionKey?: MaybeSignal<string | number | undefined>;
};

export type SignalRContextValue<T extends SignalRContract> = SignalRContextValueBase<
  T,
  StatusStore<keyof T & HubString>
>;
