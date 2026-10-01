import {
  AbortError,
  HttpError,
  HubConnectionState,
  TimeoutError,
} from "@microsoft/signalr";
import type { HubConnection } from "@microsoft/signalr";

export const DEFAULT_BACKOFF = Object.freeze([250, 1000, 3000, 5000]);
const MAX_BACKOFF = 30_000;

/** Keyed on connection state: a drop retries, a server error thrown while connected does not. */
export function isRetriableInvokeError(
  error: unknown,
  connection: HubConnection,
): boolean {
  if (connection.state !== HubConnectionState.Connected) return true;
  if (error instanceof TimeoutError) return true;
  if (error instanceof AbortError) return true;
  if (error instanceof HttpError) {
    const s = error.statusCode;
    return s === 0 || s === 408 || s === 429 || s >= 500;
  }
  return false;
}

/** Resolves the backoff delay for an attempt, capped and jittered. */
export function resolveBackoff(
  backoff: readonly number[] | ((attempt: number) => number),
  attempt: number,
): number {
  const base =
    typeof backoff === "function"
      ? backoff(attempt)
      : (backoff[Math.min(attempt, backoff.length - 1)] ?? 0);
  const capped = Math.min(base, MAX_BACKOFF);
  return capped * (0.5 + Math.random() * 0.5);
}

/** setTimeout wrapped as a cancellable promise. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  // An already-aborted signal never fires "abort", so check before listening.
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(t);
      reject(signal?.reason);
    };
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort);
  });
}
