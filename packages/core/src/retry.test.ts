import { describe, expect, it, vi } from "vitest";
import { AbortError, HttpError, HubConnectionState, TimeoutError } from "@microsoft/signalr";
import type { HubConnection } from "@microsoft/signalr";
import { isRetriableInvokeError, resolveBackoff, sleep } from "./retry.js";

describe("sleep", () => {
  it("rejects immediately when the signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();

    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    try {
      await expect(sleep(10_000, ac.signal)).rejects.toThrow();
      expect(setTimeoutSpy).not.toHaveBeenCalled(); // never scheduled the wait
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it("rejects when the signal aborts mid-sleep", async () => {
    const ac = new AbortController();
    const pending = sleep(10_000, ac.signal);
    ac.abort();
    await expect(pending).rejects.toThrow();
  });

  it("removes its abort listener once the sleep completes normally", async () => {
    const ac = new AbortController();
    const removeSpy = vi.spyOn(ac.signal, "removeEventListener");

    await sleep(1, ac.signal);

    expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));
  });
});

describe("resolveBackoff", () => {
  it("caps the delay at 30 s before jitter", () => {
    for (let i = 0; i < 50; i++) {
      const delay = resolveBackoff([60_000], 0);
      expect(delay).toBeGreaterThanOrEqual(15_000);
      expect(delay).toBeLessThanOrEqual(30_000);
    }
  });

  it("jitters between 50 and 100 percent", () => {
    for (let i = 0; i < 50; i++) {
      const delay = resolveBackoff([1000], 0);
      expect(delay).toBeGreaterThanOrEqual(500);
      expect(delay).toBeLessThanOrEqual(1000);
    }
  });

  it("repeats the last array value", () => {
    const delay = resolveBackoff([10, 1000], 9);
    expect(delay).toBeGreaterThanOrEqual(500);
  });

  it("calls a function with the attempt", () => {
    expect(resolveBackoff((attempt) => attempt * 0, 3)).toBe(0);
  });
});

describe("isRetriableInvokeError", () => {
  const connected = { state: HubConnectionState.Connected } as HubConnection;
  const dropped = { state: HubConnectionState.Reconnecting } as HubConnection;

  it("retries any error while the connection is not connected", () => {
    expect(isRetriableInvokeError(new Error("x"), dropped)).toBe(true);
  });

  it.each([0, 408, 429, 500, 503])("retries HTTP %i", (status) => {
    expect(isRetriableInvokeError(new HttpError("x", status), connected)).toBe(true);
  });

  it.each([400, 401, 404])("does not retry HTTP %i", (status) => {
    expect(isRetriableInvokeError(new HttpError("x", status), connected)).toBe(false);
  });

  it("retries TimeoutError and AbortError", () => {
    expect(isRetriableInvokeError(new TimeoutError(), connected)).toBe(true);
    expect(isRetriableInvokeError(new AbortError(), connected)).toBe(true);
  });

  it("does not retry a server error while connected", () => {
    expect(isRetriableInvokeError(new Error("x"), connected)).toBe(false);
  });
});
