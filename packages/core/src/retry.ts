import {
  AbortError,
  HttpError,
  HubConnectionState,
  TimeoutError,
} from "@microsoft/signalr";
import type { HubConnection } from "@microsoft/signalr";

export const DEFAULT_BACKOFF = [250, 1000, 3000, 5000];
const MAX_BACKOFF = 30_000;

/**
 * Thrown by `useSignalRInvoke` when a retried call exhausts its retry budget.
 * Used only when `retries > 0`. With `retries === 0`, the raw server error is
 * rethrown unwrapped, so this error appears only if you opted into retries.
 */
export class InvokeError extends Error {
  constructor(
    message: string,
    /** The last underlying error that caused the final attempt to fail. */
    readonly cause: unknown,
    /** Total number of attempts made, including the first, before giving up. */
    readonly attempts: number,
    /** Whether the final failure was classed as retriable (budget ran out) or not. */
    readonly retriable: boolean,
  ) {
    super(message);
    this.name = "InvokeError";
  }
}

/**
 * Checks whether a failed invoke is worth a retry. This is keyed on
 * CONNECTION STATE, not the error message: a transport drop leaves the
 * connection not-Connected, so it is worth a retry. An error thrown while
 * still Connected is a genuine server or business error (HubException) and
 * must NOT be retried.
 */
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
  return false; // Connected + plain Error: a server business error, no retry
}

/** Resolves the backoff delay for an attempt, capped and jittered. */
export function resolveBackoff(
  backoff: number[] | ((attempt: number) => number),
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
  if (signal?.aborted) return Promise.reject(new AbortError("aborted"));
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(t);
      reject(new AbortError("aborted"));
    };
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort);
  });
}
