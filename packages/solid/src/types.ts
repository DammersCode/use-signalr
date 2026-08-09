import type { JSX } from "solid-js";
import type {
  HubString,
  SignalRContract,
  SignalRProviderPropsBase,
  SignalRContextValueBase,
} from "@dammers/use-signalr-core";
import type { StatusStore } from "./status-store";

export type SignalRProviderProps = SignalRProviderPropsBase<JSX.Element>;

export type SignalRContextValue<T extends SignalRContract> =
  SignalRContextValueBase<T, StatusStore<keyof T & HubString>>;
