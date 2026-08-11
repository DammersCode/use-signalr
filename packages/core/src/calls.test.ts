import { describe, expect, it, vi } from "vitest";
import type { HubConnection } from "@microsoft/signalr";
import { createAbortScope, createInvoker } from "./calls.js";

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

describe("createAbortScope", () => {
  /** A connection whose invoke always fails while Disconnected, so every
   *  failure classifies as retriable and the call enters backoff. */
  function makeFailingConnection() {
    const invoke = vi.fn(() => Promise.reject(new Error("transport lost")));
    return {
      connection: { invoke, state: "Disconnected" } as unknown as HubConnection,
      invoke,
    };
  }

  it("aborts every in-flight invocation, not just the latest", async () => {
    const { connection, invoke: connInvoke } = makeFailingConnection();
    const scope = createAbortScope();
    const invoke = createInvoker<Contract, "/hub", "Count">(
      { waitForConnection: () => Promise.resolve(connection), getConnection: () => connection },
      "/hub",
      "Count",
      () => ({ retries: 5, backoff: [10_000] }),
      scope.track,
      scope.untrack,
    );

    const first = invoke();
    const second = invoke();
    // Let both fail their first attempt and settle into the backoff sleep.
    await vi.waitFor(() => expect(connInvoke).toHaveBeenCalledTimes(2));

    scope.abortAll(); // the owner's cleanup

    await expect(first).rejects.toThrow();
    await expect(second).rejects.toThrow();

    const attemptsAtAbort = connInvoke.mock.calls.length;
    await new Promise((r) => setTimeout(r, 50));
    expect(connInvoke).toHaveBeenCalledTimes(attemptsAtAbort); // neither retried
  });

  it("an aborted signal rethrows the raw error instead of reclassifying it", async () => {
    const failure = new Error("transport lost");
    const connection = {
      // Report Connected, so the classifier would call it NON-retriable and
      // wrap it in an InvokeError — the abort guard must pre-empt that.
      invoke: vi.fn(() => Promise.reject(failure)),
      state: "Connected",
    } as unknown as HubConnection;
    const scope = createAbortScope();
    const invoke = createInvoker<Contract, "/hub", "Count">(
      { waitForConnection: () => Promise.resolve(connection), getConnection: () => connection },
      "/hub",
      "Count",
      () => ({ retries: 3, backoff: [10_000] }),
      (ac) => {
        scope.track(ac);
        ac.abort();
      },
      scope.untrack,
    );

    await expect(invoke()).rejects.toBe(failure);
    expect(connection.invoke).toHaveBeenCalledTimes(1);
  });

  it("an already-aborted signal stops the retry before the next attempt", async () => {
    const { connection, invoke: connInvoke } = makeFailingConnection();
    const scope = createAbortScope();
    const invoke = createInvoker<Contract, "/hub", "Count">(
      { waitForConnection: () => Promise.resolve(connection), getConnection: () => connection },
      "/hub",
      "Count",
      () => ({ retries: 5, backoff: [10_000] }),
      // Abort the moment the controller is handed over: by the time the first
      // failure reaches the backoff sleep, the signal is ALREADY aborted.
      (ac) => {
        scope.track(ac);
        ac.abort();
      },
      scope.untrack,
    );

    await expect(invoke()).rejects.toThrow();

    expect(connInvoke).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 50));
    expect(connInvoke).toHaveBeenCalledTimes(1);
  });
});
