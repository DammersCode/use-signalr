import type { HubConnection } from "@microsoft/signalr";
import type { HubConnectionStatus, HubString, SignalRContract } from "./types.js";

export interface SignalRProviderPropsBase<TChildren> {
  children: TChildren;
  /** Base URL of the SignalR server. Connections rebuild when this changes. */
  baseUrl: string | undefined;
  /** Returns the bearer token. Read on every (re)negotiate, so token rotation
   *  needs no connection rebuild. */
  accessTokenFactory: () => string | Promise<string>;
  /** When false, all connections stop and clear. Default true. */
  enabled?: boolean;
  /** Optional rebuild trigger. Pass the access token (or any value) to force a
   *  reconnect when it changes, for example on a re-login. */
  connectionKey?: string | number;
  onStatusChange?: (hub: HubString, status: HubConnectionStatus) => void;
  onError?: (hub: HubString, error: unknown) => void;
}

export interface SignalRContextValueBase<T extends SignalRContract, TStore> {
  getConnection: (hub: keyof T & HubString) => HubConnection | null;
  /** Point read of the hub's current status. Use `useHubStatus` for a subscribed read. */
  isHubConnected: (hub: keyof T & HubString) => boolean;
  /** Point read of the hub's current status. Use `useHubStatus` for a subscribed read. */
  getStatus: (hub: keyof T & HubString) => HubConnectionStatus;
  waitForConnection: (
    hub: keyof T & HubString,
    timeoutMs: number,
  ) => Promise<HubConnection>;
  /** Status store backing `useHubStatus`. */
  statusStore: TStore;
  /** Lazy ref-count: keeps a hub alive while a consumer is mounted. */
  acquire: (hub: keyof T & HubString) => void;
  release: (hub: keyof T & HubString) => void;
  /** Registers a reconnect callback for a hub. Returns an unsubscribe fn. */
  registerReconnect: (hub: keyof T & HubString, cb: () => void) => () => void;
}
