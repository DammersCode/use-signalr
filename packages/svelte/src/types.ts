import type { Readable } from "svelte/store";
import type {
  SignalRContract,
  SignalRProviderPropsBase,
  SignalRContextValueBase,
  HubString,
} from "@dammers/use-signalr-core";
import type { StatusStore } from "./status-store";

/** A value that can also be supplied as a store, to make the provider react to it. */
export type MaybeReadable<T> = T | Readable<T>;

export type SignalRProviderProps = Omit<
  SignalRProviderPropsBase<never>,
  "children" | "baseUrl" | "enabled" | "connectionKey"
> & {
  baseUrl: MaybeReadable<string | undefined>;
  enabled?: MaybeReadable<boolean>;
  connectionKey?: MaybeReadable<string | number | undefined>;
};

export type SignalRContextValue<T extends SignalRContract> = SignalRContextValueBase<
  T,
  StatusStore<keyof T & HubString>
>;
