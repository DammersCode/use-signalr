import type { MaybeRefOrGetter } from "vue";
import type {
  HubConnectionStatus,
  HubString,
  SignalRContract,
  SignalRContextValueBase,
  SignalRProviderPropsBase,
} from "@dammers/use-signalr-core";
import type { StatusStore } from "./status-store";

export type { MaybeRefOrGetter } from "vue";

export type SignalROptions<T extends SignalRContract = SignalRContract> = Omit<
  SignalRProviderPropsBase<never>,
  "children" | "baseUrl" | "enabled" | "connectionKey" | "onStatusChange" | "onError"
> & {
  baseUrl: MaybeRefOrGetter<string | undefined>;
  enabled?: MaybeRefOrGetter<boolean>;
  connectionKey?: MaybeRefOrGetter<string | number | undefined>;
  onStatusChange?: (hub: keyof T & HubString, status: HubConnectionStatus) => void;
  onError?: (hub: keyof T & HubString, error: unknown) => void;
};

export type SignalRContextValue<T extends SignalRContract> = SignalRContextValueBase<
  T,
  StatusStore<keyof T & HubString>
>;
