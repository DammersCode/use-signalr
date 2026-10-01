// An unmount aborts a waiting call with an AbortError. That is expected, so only other errors are logged.
export function ignoreAbort(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") return;
  console.error(error);
}
