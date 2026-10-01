import type {
  HubConnectionStatus,
  SignalRErrorInfo,
  HubString,
  SignalRContract,
  SignalRContextValueBase,
  SignalRProviderPropsBase,
} from "@dammers/use-signalr-core";
import type { StatusStore } from "./status-store.js";

export interface SignalRSessionOptions<H extends HubString = HubString>
  extends SignalRProviderPropsBase<H> {
  /** Runs when the status of a hub changes. The session reads it once when it is created, so `update()` does not change it. */
  onStatusChange?: (hub: H, status: HubConnectionStatus) => void;
  /** Runs on a connection error and on an error that your callback throws. `info.source` is `"connection"` or `"callback"`. The session reads it once when it is created, so `update()` does not change it. */
  onError?: (hub: H, error: unknown, info: SignalRErrorInfo) => void;
}

export type SignalRSessionUpdate = Partial<
  Pick<
    SignalRSessionOptions,
    "baseUrl" | "enabled" | "connectionKey" | "accessTokenFactory"
  >
>;

export type SignalRContextValue<T extends SignalRContract> =
  SignalRContextValueBase<T, StatusStore<keyof T & HubString>>;
