import { useEffect } from "react";
import { describe, it, expect } from "vitest";
import { act, render } from "@testing-library/react";
import { makeHarness } from "./test-harness";

const HUB = "/hubs/chat" as const;
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 1. A retrying invoke that is mid-backoff when the component unmounts:
//    - DEFAULT: the unmount aborts the backoff, so the retry never reaches the
//      server (the in-flight call is cancelled).
//    - keepAliveOnUnmount: the backoff is NOT aborted, the retry proceeds and
//      the call reaches the server.
describe("useSignalRInvoke keepAliveOnUnmount", () => {
  function mount(keepAlive: boolean) {
    const h = makeHarness({ startConnected: true, failWaitOnce: true });
    function Leaver() {
      const leave = h.hooks.useSignalRInvoke(HUB, "LeaveRoomAsync", {
        retries: 1,
        backoff: [30], // first attempt fails -> 30ms backoff -> retry
        keepAliveOnUnmount: keepAlive,
      });
      useEffect(() => {
        leave("room-1").catch(() => {}); // start while mounted
      }, [leave]);
      return null;
    }
    const view = render(
      <h.Provider>
        <Leaver />
      </h.Provider>,
    );
    return { h, view };
  }

  it("DEFAULT: aborts the mid-backoff retry on unmount (call never reaches server)", async () => {
    const { h, view } = mount(false);
    await act(async () => {
      await Promise.resolve(); // first attempt fails, enters backoff sleep
      view.unmount(); // abort fires during the 30ms backoff
      await tick(60); // past when the retry would have run
    });
    expect(h.fake.invokeCalls).toEqual([]); // retry was cancelled
  });

  it("keepAliveOnUnmount: lets the mid-backoff retry finish and reach the server", async () => {
    const { h, view } = mount(true);
    await act(async () => {
      await Promise.resolve(); // first attempt fails, enters backoff sleep
      view.unmount(); // NOT aborted
      await tick(60); // backoff elapses, retry runs
      await Promise.resolve();
    });
    expect(h.fake.invokeCalls).toEqual([
      { method: "LeaveRoomAsync", args: ["room-1"] },
    ]);
    h.fake.resolveInvoke();
  });
});

// 2. A teardown issued while the hub is still connecting must QUEUE and flush
//    on connect, not drop. It must also survive the component's unmount.
describe("useSignalRTeardown queue-while-connecting", () => {
  it("queues the send until connected, then flushes, surviving unmount", async () => {
    const h = makeHarness({ startConnected: false }); // still connecting

    function Session() {
      const teardown = h.hooks.useSignalRTeardown(HUB, "LeaveRoomAsync");
      useEffect(() => {
        return () => {
          void teardown("room-1"); // cleanup fires while NOT yet connected
        };
      }, [teardown]);
      return null;
    }

    const view = render(
      <h.Provider>
        <Session />
      </h.Provider>,
    );

    act(() => view.unmount());

    // Not connected yet: must NOT have dropped. Nothing sent yet, but it is waiting.
    expect(h.fake.sendCalls).toEqual([]);
    // It acquired the hub to hold it open past unmount.
    expect(h.acquireCount).toBeGreaterThan(h.releaseCount);

    // The connection comes up: the queued leave must flush.
    await act(async () => {
      h.connect();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(h.fake.sendCalls).toEqual([
      { method: "LeaveRoomAsync", args: ["room-1"] },
    ]);
    // It released the hub after flushing.
    expect(h.releaseCount).toBe(h.acquireCount);
  });

  it("contrast: useSignalRSend drops while connecting", async () => {
    const h = makeHarness({ startConnected: false });

    function Session() {
      const send = h.hooks.useSignalRSend(HUB, "LeaveRoomAsync");
      useEffect(() => {
        return () => {
          void send("room-1");
        };
      }, [send]);
      return null;
    }

    const view = render(
      <h.Provider>
        <Session />
      </h.Provider>,
    );
    act(() => view.unmount());

    // Even after connecting, the dropped send never flushes — it resolved false.
    await act(async () => {
      h.connect();
      await Promise.resolve();
    });
    expect(h.fake.sendCalls).toEqual([]);
  });
});
