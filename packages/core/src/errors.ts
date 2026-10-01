/** The `name` values of the errors that `waitForConnection` rejects with. */
export const SIGNALR_ERROR_NAMES = {
  disabled: "SignalRDisabledError",
  disconnected: "SignalRDisconnectedError",
  timeout: "SignalRTimeoutError",
} as const;

export function namedError(name: (typeof SIGNALR_ERROR_NAMES)[keyof typeof SIGNALR_ERROR_NAMES], message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

/** A wait on a disabled or failed hub cannot succeed by waiting longer. */
export function isFinalWaitError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === SIGNALR_ERROR_NAMES.disabled || error.name === SIGNALR_ERROR_NAMES.disconnected)
  );
}