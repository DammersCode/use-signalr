import type {
  SignalRContract,
  SignalRProviderPropsBase,
  SignalRContextValueBase,
  HubString,
} from "@dammers/use-signalr-core";
import type { Signal } from "@angular/core";
import type { StatusStore } from "./status-store.js";

/** A value that can also be supplied as a zero-arg getter or a `Signal`, to
 *  make `provideSignalR` react to it (token rotation, enable/disable).
 *  Never use a function type for `T`: a plain function and a getter are
 *  the same thing at runtime. See `TokenFactory` for the safe pattern. */
export type MaybeSignal<T> = T | Signal<T> | (() => T);

export type TokenFactory = () => string | Promise<string>;

export type SignalROptions = Omit<
  SignalRProviderPropsBase<never>,
  "children" | "baseUrl" | "accessTokenFactory" | "enabled" | "connectionKey"
> & {
  baseUrl: MaybeSignal<string | undefined>;
  /** A plain factory or a Signal of one — never a getter, which is indistinguishable from the factory itself. */
  accessTokenFactory: TokenFactory | Signal<TokenFactory>;
  enabled?: MaybeSignal<boolean>;
  connectionKey?: MaybeSignal<string | number | undefined>;
};

export type SignalRContextValue<T extends SignalRContract> = SignalRContextValueBase<
  T,
  StatusStore<keyof T & HubString>
>;
