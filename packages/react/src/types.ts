import type { ReactNode } from "react";
import type {
  HubString,
  SignalRContract,
  SignalRProviderPropsBase,
  SignalRContextValueBase,
} from "@dammers/use-signalr-core";
import type { StatusStore } from "./status-store.js";

export type SignalRProviderProps = SignalRProviderPropsBase<ReactNode>;

export type SignalRContextValue<T extends SignalRContract> =
  SignalRContextValueBase<T, StatusStore<keyof T & HubString>>;
