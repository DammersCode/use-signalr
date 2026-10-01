import { HttpError, HttpTransportType, LogLevel, TransferFormat } from "@microsoft/signalr";
import type { IHubProtocol } from "@microsoft/signalr";
import type {
  ConfigureBuilder,
  HubDef,
  HttpOptions,
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

function mergeHttpOptions(global: HttpOptions = {}, perHub: HttpOptions = {}): HttpOptions {
  const merged = { ...global, ...perHub };
  if (global.headers && perHub.headers) {
    merged.headers = { ...global.headers, ...perHub.headers };
  }
  return merged;
}

/** Join the base URL and a hub path without a double slash. */
export function joinHubUrl(baseUrl: string, hub: HubString): string {
  return `${baseUrl.replace(/\/+$/, "")}${hub}`;
}

/** Throws when a binary protocol meets a transport that only has Server-Sent Events. */
export function assertProtocolFitsTransport(
  hub: string,
  protocol: IHubProtocol,
  httpOptions: HttpOptions,
): void {
  if (
    protocol.transferFormat === TransferFormat.Binary &&
    httpOptions.transport === HttpTransportType.ServerSentEvents
  ) {
    throw new Error(
      `Hub "${hub}": the "${protocol.name}" protocol sends binary data. ` +
        "Server-Sent Events cannot carry binary data. " +
        "Use WebSockets or LongPolling in httpOptions.transport, or use a text protocol.",
    );
  }
}

/** Throws when skipNegotiation is on and the transport is not WebSockets only. */
function assertSkipNegotiationFitsTransport(hub: string, httpOptions: HttpOptions): void {
  if (httpOptions.skipNegotiation && httpOptions.transport !== HttpTransportType.WebSockets) {
    throw new Error(
      `Hub "${hub}": skipNegotiation needs httpOptions.transport = HttpTransportType.WebSockets.`,
    );
  }
}

const REMOVED_KEYS = {
  transport: "Move it into httpOptions.",
  skipNegotiation: "Move it into httpOptions.",
  maxConnectRetries: "The library retries a failed hub until the hub stops. Delete the option.",
} as const;

function assertNoRemovedKeys(where: string, options: object | undefined): void {
  if (!options) return;
  for (const [key, advice] of Object.entries(REMOVED_KEYS)) {
    if (key in options) throw new Error(`${where}: the "${key}" option does not exist. ${advice}`);
  }
}

/** Merge a hub's per-hub config over the global defaults. */
export function resolveHubConfig<H extends Record<HubString, HubDef>>(
  config: SignalRClientConfig<H>,
  hub: keyof H & HubString,
): ResolvedHubConfig {
  const perHub: HubDef | undefined = config.hubs[hub];
  assertNoRemovedKeys("SignalR config", config);
  assertNoRemovedKeys(`Hub "${hub}"`, perHub);
  const httpOptions = mergeHttpOptions(config.httpOptions, perHub?.httpOptions);
  assertSkipNegotiationFitsTransport(hub, httpOptions);
  const hubProtocol = perHub?.hubProtocol ?? config.hubProtocol;
  if (hubProtocol && typeof hubProtocol !== "function") {
    assertProtocolFitsTransport(hub, hubProtocol, httpOptions);
  }
  const configureBuilders: ConfigureBuilder[] = [];
  if (config.configureBuilder) configureBuilders.push(config.configureBuilder);
  if (perHub?.configureBuilder) configureBuilders.push(perHub.configureBuilder);
  return {
    lazy: perHub?.lazy ?? config.lazy ?? false,
    graceMs: perHub?.graceMs ?? 0,
    reconnect: perHub?.reconnect ?? config.reconnect ?? true,
    logLevel: perHub?.logLevel ?? config.logLevel ?? LogLevel.Information,
    httpOptions,
    hubProtocol,
    configureBuilders,
    events: Object.keys(perHub?.events ?? {}),
  };
}

/** True for network, timeout, and 5xx failures. Auth, wrong-path, and bad-request negotiate failures are permanent. */
export function isRetriableConnectError(err: unknown): boolean {
  const s = err instanceof HttpError ? err.statusCode : negotiateStatusCode(err);
  // 0 (network), 408, 429, 5xx, timeouts, and unknown errors are transient.
  return !(s === 400 || s === 401 || s === 403 || s === 404);
}

// SignalR wraps negotiate HttpErrors and keeps only their message.
function negotiateStatusCode(err: unknown): number | undefined {
  if (!(err instanceof Error) || !("errorType" in err)) return undefined;
  if (err.errorType !== "FailedToNegotiateWithServerError") return undefined;
  const code = /Status code '(\d{3})'/.exec(err.message)?.[1];
  return code === undefined ? undefined : Number(code);
}
