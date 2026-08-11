import { describe, expect, it, vi } from "vitest";
import { sleep } from "./retry.js";

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
