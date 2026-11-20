import type {
  HubString,
  SignalRContract,
  SignalRProviderPropsBase,
  SignalRContextValueBase,
} from "@dammers/use-signalr-core";
import type { StatusStore } from "./status-store.js";

/** Structural stand-in for the JSX element type, which Solid 1 and Solid 2 export from different modules. */
export type SolidNode =
  | Node
  | string
  | number
  | boolean
  | null
  | undefined
  | SolidNode[]
  | (() => SolidNode);

export type SignalRProviderProps<THub extends HubString = HubString> =
  SignalRProviderPropsBase<THub> & {
    /** The component tree that uses the hooks. */
    children: SolidNode;
  };

export type SignalRContextValue<T extends SignalRContract> =
  SignalRContextValueBase<T, StatusStore<keyof T & HubString>>;
