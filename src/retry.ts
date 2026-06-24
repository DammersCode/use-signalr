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
 * Only used when `retries > 0`; with `retries === 0` the raw server error is
 * rethrown unwrapped, so you won't see this unless you opted into retries.
 *
 * @example
 * try {
 *   await invoke(arg);
 * } catch (e) {
 *   if (e instanceof InvokeError) {
 *     console.error(`failed after ${e.attempts} attempts`, e.cause);
 *   }
 * }
 */
export class InvokeError extends Error {
  constructor(
    message: string,
    /** The last underlying error that caused the final attempt to fail. */
    readonly cause: unknown,
    /** Total number of attempts made (including the first) before giving up. */
    readonly attempts: number,
    /** Whether the final failure was classed retriable (budget ran out) vs not. */
    readonly retriable: boolean,
  ) {
    super(message);
    this.name = "InvokeError";
  }
}

/**
 * Whether a failed invoke should be retried. Keyed on CONNECTION STATE, not the
 * error message: a transport drop leaves the connection not-Connected (retry);
 * an error thrown while still Connected is a genuine server/business error
 * (HubException) and must NOT be retried.
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
  return false; // Connected + plain Error -> server business error -> no retry
}

/** Resolve the backoff delay for an attempt, capped and jittered. */
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

/** setTimeout as a cancellable promise. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new AbortError("aborted"));
    });
  });
}
