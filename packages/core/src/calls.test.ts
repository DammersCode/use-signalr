import { describe, expect, it, vi } from "vitest";
import type { HubConnection } from "@microsoft/signalr";
import { createAbortScope, createInvoker, createSender, createTeardownSender } from "./calls.js";

type Contract = {
  "/hub": { methods: { Count: () => Promise<number> } };
};

describe("createInvoker", () => {
  it("passes the scope signal to waitForConnection", async () => {
    const connection = {
      invoke: vi.fn().mockResolvedValue(7),
    } as unknown as HubConnection;
    const scope = createAbortScope();
    const waitForConnection = vi.fn(
      (_hub: string, _timeout: number, _signal?: AbortSignal) =>
        Promise.resolve(connection),
    );
    const invoke = createInvoker<Contract, "/hub", "Count">({
      target: { waitForConnection, getConnection: () => connection },
      hub: "/hub",
      method: "Count",
      getOptions: () => undefined,
      getSignal: scope.signal,
    });

    await expect(invoke()).resolves.toBe(7);
    expect(waitForConnection.mock.calls[0]![2]).toBe(scope.signal());
  });

  it("works without a signal", async () => {
    const connection = {
      invoke: vi.fn().mockResolvedValue(7),
    } as unknown as HubConnection;
    const invoke = createInvoker<Contract, "/hub", "Count">({
      target: {
        waitForConnection: () => Promise.resolve(connection),
        getConnection: () => connection,
      },
      hub: "/hub",
      method: "Count",
      getOptions: () => undefined,
    });

    await expect(invoke()).resolves.toBe(7);
  });
});

describe("createInvoker keepAliveOnUnmount", () => {
  const connection = { invoke: vi.fn().mockResolvedValue(7) } as unknown as HubConnection;
  const make = (keepAliveOnUnmount: boolean | undefined, log: string[]) =>
    createInvoker<Contract, "/hub", "Count">({
      target: {
        waitForConnection: () => {
          log.push("wait");
          return Promise.resolve(connection);
        },
        getConnection: () => connection,
        acquire: () => log.push("acquire"),
        release: () => log.push("release"),
      },
      hub: "/hub",
      method: "Count",
      getOptions: () => ({ keepAliveOnUnmount }),
    });

  it("holds the hub from the call start until the call settles", async () => {
    const log: string[] = [];
    await make(true, log)();

    expect(log).toEqual(["acquire", "wait", "release"]);
  });

  it("releases when the call fails", async () => {
    const log: string[] = [];
    vi.mocked(connection.invoke).mockRejectedValueOnce(new Error("boom"));
    await expect(make(true, log)()).rejects.toThrow("boom");

    expect(log).toEqual(["acquire", "wait", "release"]);
  });

  it("does not hold the hub without the option", async () => {
    const log: string[] = [];
    await make(undefined, log)();

    expect(log).toEqual(["wait"]);
  });
});

describe("createAbortScope", () => {
  it("starts a fresh signal after abort", () => {
    const scope = createAbortScope();
    const first = scope.signal();
    scope.abort();

    expect(first.aborted).toBe(true);
    expect(scope.signal().aborted).toBe(false);
  });
});

describe("createInvoker abort during the wait", () => {
  it("passes the abort signal to waitForConnection and never invokes", async () => {
    const connection = { invoke: vi.fn() } as unknown as HubConnection;
    const scope = createAbortScope();
    const waitForConnection = vi.fn(
      (_hub: string, _timeout: number, signal?: AbortSignal) =>
        new Promise<HubConnection>((_resolve, reject) => {
          signal?.addEventListener("abort", () =>
            reject(signal.reason),
          );
        }),
    );
    const invoke = createInvoker<Contract, "/hub", "Count">({
      target: { waitForConnection, getConnection: () => connection },
      hub: "/hub",
      method: "Count",
      getOptions: () => undefined,
      getSignal: scope.signal,
    });

    const call = invoke();
    const settled = expect(call).rejects.toMatchObject({ name: "AbortError" });
    scope.abort();

    await settled;
    expect(waitForConnection.mock.calls[0]![2]).toBeInstanceOf(AbortSignal);
    expect(connection.invoke).not.toHaveBeenCalled();
  });

  it("throws AbortError when the wait resolves after the abort", async () => {
    const connection = { invoke: vi.fn() } as unknown as HubConnection;
    const controller = new AbortController();
    const invoke = createInvoker<Contract, "/hub", "Count">({
      target: {
        waitForConnection: () => Promise.resolve(connection),
        getConnection: () => connection,
      },
      hub: "/hub",
      method: "Count",
      getOptions: () => undefined,
      getSignal: () => {
        queueMicrotask(() => controller.abort());
        return controller.signal;
      },
    });

    await expect(invoke()).rejects.toMatchObject({ name: "AbortError" });
    expect(connection.invoke).not.toHaveBeenCalled();
  });
  it("rejects with the same last error after the retries run out", async () => {
    const failure = new Error("transport lost");
    const connection = {
      invoke: vi.fn(() => Promise.reject(failure)),
      state: "Disconnected",
    } as unknown as HubConnection;
    const invoke = createInvoker<Contract, "/hub", "Count">({
      target: { waitForConnection: () => Promise.resolve(connection), getConnection: () => connection },
      hub: "/hub",
      method: "Count",
      getOptions: () => ({ retries: 2, backoff: [0] }),
    });

    await expect(invoke()).rejects.toBe(failure);
    expect(connection.invoke).toHaveBeenCalledTimes(3);
  });

  it("rejects with the same error for a non-retriable failure", async () => {
    const failure = new Error("business error");
    const connection = {
      invoke: vi.fn(() => Promise.reject(failure)),
      state: "Connected",
    } as unknown as HubConnection;
    const invoke = createInvoker<Contract, "/hub", "Count">({
      target: { waitForConnection: () => Promise.resolve(connection), getConnection: () => connection },
      hub: "/hub",
      method: "Count",
      getOptions: () => ({ retries: 2, backoff: [0] }),
    });

    await expect(invoke()).rejects.toBe(failure);
    expect(connection.invoke).toHaveBeenCalledTimes(1);
  });

  it("rejects with signal.reason on abort", async () => {
    const reason = new Error("custom reason");
    const controller = new AbortController();
    controller.abort(reason);
    const connection = { invoke: vi.fn(), state: "Connected" } as unknown as HubConnection;
    const invoke = createInvoker<Contract, "/hub", "Count">({
      target: {
        waitForConnection: (_h, _t, signal) => Promise.reject(signal?.reason),
        getConnection: () => connection,
      },
      hub: "/hub",
      method: "Count",
      getOptions: () => undefined,
      getSignal: () => controller.signal,
    });

    await expect(invoke()).rejects.toBe(reason);
  });
});

describe("createSender", () => {
  it("resolves false when the hub is not connected", async () => {
    const connection = { send: vi.fn(), state: "Disconnected" } as unknown as HubConnection;
    const send = createSender<Contract, "/hub", "Count">({
      getConnection: () => connection,
      hub: "/hub",
      method: "Count",
    });

    await expect(send()).resolves.toBe(false);
    expect(connection.send).not.toHaveBeenCalled();
  });

  it("resolves false when connection.send rejects", async () => {
    const connection = {
      send: vi.fn(() => Promise.reject(new Error("send failed"))),
      state: "Connected",
    } as unknown as HubConnection;
    const send = createSender<Contract, "/hub", "Count">({
      getConnection: () => connection,
      hub: "/hub",
      method: "Count",
    });

    await expect(send()).resolves.toBe(false);
  });
});

describe("createInvoker with an abort scope", () => {
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
    const invoke = createInvoker<Contract, "/hub", "Count">({
      target: { waitForConnection: () => Promise.resolve(connection), getConnection: () => connection },
      hub: "/hub",
      method: "Count",
      getOptions: () => ({ retries: 5, backoff: [10_000] }),
      getSignal: scope.signal,
    });

    const first = invoke();
    const second = invoke();
    // Let both fail their first attempt and settle into the backoff sleep.
    await vi.waitFor(() => expect(connInvoke).toHaveBeenCalledTimes(2));

    scope.abort(); // the owner's cleanup

    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await expect(second).rejects.toMatchObject({ name: "AbortError" });

    const attemptsAtAbort = connInvoke.mock.calls.length;
    await new Promise((r) => setTimeout(r, 50));
    expect(connInvoke).toHaveBeenCalledTimes(attemptsAtAbort); // neither retried
  });

  it("aborts with a named reason that says the consumer unmounted", () => {
    const scope = createAbortScope();
    const signal = scope.signal();
    scope.abort();
    expect(signal.reason).toBeInstanceOf(DOMException);
    expect(signal.reason).toMatchObject({
      name: "AbortError",
      message: "The consumer unmounted, so the call was aborted.",
    });
  });

  it("an aborted signal rethrows the raw error instead of reclassifying it", async () => {
    const failure = new Error("transport lost");
    const scope = createAbortScope();
    const connection = {
      // Report Connected, so the classifier would call it NON-retriable;
      // the abort guard must pre-empt that.
      invoke: vi.fn(() => {
        scope.abort();
        return Promise.reject(failure);
      }),
      state: "Connected",
    } as unknown as HubConnection;
    const invoke = createInvoker<Contract, "/hub", "Count">({
      target: { waitForConnection: () => Promise.resolve(connection), getConnection: () => connection },
      hub: "/hub",
      method: "Count",
      getOptions: () => ({ retries: 3, backoff: [10_000] }),
      getSignal: scope.signal,
    });

    await expect(invoke()).rejects.toBe(failure);
    expect(connection.invoke).toHaveBeenCalledTimes(1);
  });

  it("an already-aborted signal stops the call before the first attempt", async () => {
    const { connection, invoke: connInvoke } = makeFailingConnection();
    const signal = AbortSignal.abort();
    const invoke = createInvoker<Contract, "/hub", "Count">({
      target: { waitForConnection: () => Promise.resolve(connection), getConnection: () => connection },
      hub: "/hub",
      method: "Count",
      getOptions: () => ({ retries: 5, backoff: [10_000] }),
      getSignal: () => signal,
    });

    await expect(invoke()).rejects.toMatchObject({ name: "AbortError" });

    await new Promise((r) => setTimeout(r, 50));
    expect(connInvoke).not.toHaveBeenCalled();
  });
});

describe("createTeardownSender", () => {
  function setup(connection: Promise<HubConnection>) {
    const acquire = vi.fn();
    const release = vi.fn();
    const send = createTeardownSender<Contract, "/hub", "Count">({
      target: { acquire, release, waitForConnection: () => connection },
      hub: "/hub",
      method: "Count",
      getOptions: () => undefined,
    });
    return { acquire, release, send };
  }

  it("acquires the hub, sends, and releases it after the send", async () => {
    const connection = { send: vi.fn().mockResolvedValue(undefined) } as unknown as HubConnection;
    const { acquire, release, send } = setup(Promise.resolve(connection));

    await expect(send()).resolves.toBe(true);

    expect(acquire).toHaveBeenCalledWith("/hub");
    expect(release).toHaveBeenCalledWith("/hub");
    expect(connection.send).toHaveBeenCalledWith("Count");
  });

  it("releases the hub and resolves false when the wait fails", async () => {
    const { release, send } = setup(Promise.reject(new Error("timeout")));

    await expect(send()).resolves.toBe(false);

    expect(release).toHaveBeenCalledWith("/hub");
  });

  it("releases the hub and resolves false when the send fails", async () => {
    const connection = { send: vi.fn().mockRejectedValue(new Error("lost")) } as unknown as HubConnection;
    const { release, send } = setup(Promise.resolve(connection));

    await expect(send()).resolves.toBe(false);

    expect(release).toHaveBeenCalledWith("/hub");
  });
});

describe("createInvoker: session wait errors", () => {
  const failWith = (name: string) => Object.assign(new Error("wait failed"), { name });

  function setup(error: Error, options: { isRetriable?: (e: unknown) => boolean | undefined } = {}) {
    const waitForConnection = vi.fn(() => Promise.reject(error));
    const invoke = createInvoker<Contract, "/hub", "Count">({
      target: { waitForConnection, getConnection: () => null },
      hub: "/hub",
      method: "Count",
      getOptions: () => ({ retries: 2, backoff: [0], ...options }),
    });
    return { invoke, waitForConnection };
  }

  it.each(["SignalRDisabledError", "SignalRDisconnectedError"])(
    "does not retry a %s",
    async (name) => {
      const error = failWith(name);
      const { invoke, waitForConnection } = setup(error);

      await expect(invoke()).rejects.toBe(error);
      expect(waitForConnection).toHaveBeenCalledTimes(1);
    },
  );

  it("retries a SignalRTimeoutError", async () => {
    const error = failWith("SignalRTimeoutError");
    const { invoke, waitForConnection } = setup(error);

    await expect(invoke()).rejects.toBe(error);
    expect(waitForConnection).toHaveBeenCalledTimes(3);
  });

  it("lets a user isRetriable result win over the default rule", async () => {
    const error = failWith("SignalRDisabledError");
    const { invoke, waitForConnection } = setup(error, { isRetriable: () => true });

    await expect(invoke()).rejects.toBe(error);
    expect(waitForConnection).toHaveBeenCalledTimes(3);
  });
});
