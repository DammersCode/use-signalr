import { HttpError, LogLevel } from "@microsoft/signalr";
import type {
  HubDef,
  HubString,
  ResolvedHubConfig,
  SignalRClientConfig,
} from "./types.js";

/** Typed `Object.keys`. Narrows the keys to the declared hubs. */
export function hubKeys<H extends Record<HubString, HubDef>>(
  config: SignalRClientConfig<H>,
): Array<keyof H & HubString> {
  return Object.keys(config.hubs) as Array<keyof H & HubString>;
}

/** Merge a hub's per-hub config over the global defaults. */
export function resolveHubConfig<H extends Record<HubString, HubDef>>(
  config: SignalRClientConfig<H>,
  perHub: HubDef | undefined,
): ResolvedHubConfig {
  return {
    lazy: perHub?.lazy ?? config.lazy ?? false,
    graceMs: perHub?.graceMs ?? 0,
    reconnect: perHub?.reconnect ?? config.reconnect ?? true,
    maxConnectRetries: perHub?.maxConnectRetries ?? config.maxConnectRetries ?? 2,
    logLevel: perHub?.logLevel ?? config.logLevel ?? LogLevel.Information,
    transport: perHub?.transport,
    skipNegotiation: perHub?.skipNegotiation,
    events: Object.keys(perHub?.events ?? {}),
  };
}

/**
 * Checks whether a FIRST-CONNECT failure is worth a retry. Permanent
 * negotiate failures (auth, wrong path, bad request) are not — a retry just
 * hammers the server. Network, transient, and 5xx failures are worth a retry.
 */
export function isRetriableConnectError(err: unknown): boolean {
  if (err instanceof HttpError) {
    const s = err.statusCode;
    if (s === 400 || s === 401 || s === 403 || s === 404) return false;
    return true; // 0 (network), 408, 429, 5xx, and other transient codes
  }
  return true; // timeout, transport, or unknown error: retry
}
