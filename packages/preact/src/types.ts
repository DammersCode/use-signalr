import type { ComponentChildren } from "preact";
import type { HubString, SignalRContract, SignalRContextValueBase, SignalRProviderPropsBase } from "@dammers/use-signalr-core";
import type { StatusStore } from "./status-store.js";

export type SignalRProviderProps<THub extends HubString = HubString> =
  SignalRProviderPropsBase<THub> & {
    /** The component tree that uses the hooks. */
    children: ComponentChildren;
  };
export type SignalRContextValue<T extends SignalRContract> = SignalRContextValueBase<T, StatusStore<keyof T & HubString>>;
