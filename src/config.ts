import { HttpError, LogLevel } from "@microsoft/signalr";
import type {
  HubString,
  PerHubConfig,
  ResolvedHubConfig,
  SignalRClientConfig,
  SignalRContract,
} from "./types";

/** Typed `Object.keys` — narrows the keys to the declared hubs. */
export function hubKeys<T extends SignalRContract>(
  config: SignalRClientConfig<T>,
): Array<keyof T & HubString> {
  return Object.keys(config.hubs) as Array<keyof T & HubString>;
}

/** Merge a hub's per-hub config over the global defaults. */
export function resolveHubConfig<T extends SignalRContract>(
  config: SignalRClientConfig<T>,
  perHub: PerHubConfig | undefined,
): ResolvedHubConfig {
  return {
    lazy: perHub?.lazy ?? config.lazy ?? false,
    graceMs: perHub?.graceMs ?? 0,
    reconnect: perHub?.reconnect ?? config.reconnect ?? true,
    maxConnectRetries: perHub?.maxConnectRetries ?? config.maxConnectRetries ?? 2,
    logLevel: perHub?.logLevel ?? config.logLevel ?? LogLevel.Information,
    transport: perHub?.transport,
    skipNegotiation: perHub?.skipNegotiation,
  };
}

/**
 * Whether a FIRST-CONNECT failure is worth retrying. Permanent negotiate
 * failures (auth, wrong path, bad request) are not — retrying just hammers the
 * server. Network/transient/5xx are.
 */
export function isRetriableConnectError(err: unknown): boolean {
  if (err instanceof HttpError) {
    const s = err.statusCode;
    if (s === 400 || s === 401 || s === 403 || s === 404) return false;
    return true; // 0 (network), 408, 429, 5xx, etc.
  }
  return true; // timeout / transport / unknown -> retry
}
