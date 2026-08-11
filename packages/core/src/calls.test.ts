import { describe, expect, it, vi } from "vitest";
import type { HubConnection } from "@microsoft/signalr";
import { createInvoker } from "./calls";

type Contract = {
  "/hub": { methods: { Count: () => Promise<number> } };
};

describe("createInvoker", () => {
  it("releases its AbortController after the call settles", async () => {
    const connection = {
      invoke: vi.fn().mockResolvedValue(7),
    } as unknown as HubConnection;
    const setAbort = vi.fn();
    const clearAbort = vi.fn();
    const invoke = createInvoker<Contract, "/hub", "Count">(
      {
        waitForConnection: () => Promise.resolve(connection),
        getConnection: () => connection,
      },
      "/hub",
      "Count",
      () => undefined,
      setAbort,
      clearAbort,
    );

    await expect(invoke()).resolves.toBe(7);
    expect(clearAbort).toHaveBeenCalledWith(setAbort.mock.calls[0]![0]);
  });
});
