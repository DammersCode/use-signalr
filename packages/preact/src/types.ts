import type { ComponentChildren } from "preact";
import type { HubString, SignalRContract, SignalRContextValueBase, SignalRProviderPropsBase } from "@dammers/use-signalr-core";
import type { StatusStore } from "./status-store.js";

export type SignalRProviderProps = SignalRProviderPropsBase<ComponentChildren>;
export type SignalRContextValue<T extends SignalRContract> = SignalRContextValueBase<T, StatusStore<keyof T & HubString>>;
