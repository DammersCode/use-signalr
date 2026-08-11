import type {
  HubConnectionStatus,
  HubString,
  SignalRContract,
  SignalRContextValueBase,
} from "@dammers/use-signalr-core";
import type { StatusStore } from "./status-store";

export interface SignalRSessionOptions<H extends HubString = HubString> {
  baseUrl: string | undefined;
  accessTokenFactory: () => string | Promise<string>;
  enabled?: boolean;
  onStatusChange?: (hub: H, status: HubConnectionStatus) => void;
  onError?: (hub: H, error: unknown) => void;
}

export type SignalRContextValue<T extends SignalRContract> =
  SignalRContextValueBase<T, StatusStore<keyof T & HubString>>;
