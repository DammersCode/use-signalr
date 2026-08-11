import { describe, it, expect } from "vitest";
import { DestroyRef, inject } from "@angular/core";
import { makeHarness } from "./test-harness";

const HUB = "/hubs/chat" as const;
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 1. A retrying invoke that is mid-backoff when the injection scope is
//    destroyed:
//    - DEFAULT: destroying aborts the backoff, so the retry never reaches the
//      server (the in-flight call is cancelled).
//    - keepAliveOnUnmount: the backoff is NOT aborted, the retry proceeds and
//      the call reaches the server.
describe("injectHubInvoke keepAliveOnUnmount", () => {
  function mountLeaver(keepAlive: boolean) {
    const h = makeHarness({ startConnected: true, failWaitOnce: true });
    h.run(() => {
      const leave = h.hooks.injectHubInvoke(HUB, "LeaveRoomAsync", {
        retries: 1,
        backoff: [30], // first attempt fails -> 30ms backoff -> retry
        keepAliveOnUnmount: keepAlive,
      });
      leave("room-1").catch(() => {}); // start during init
    });
    return h;
  }

  it("DEFAULT: aborts the mid-backoff retry on destroy (call never reaches server)", async () => {
    const h = mountLeaver(false);
    await Promise.resolve(); // first attempt fails, enters backoff sleep
    h.destroy(); // abort fires during the 30ms backoff
    await tick(60); // past when the retry would have run
    expect(h.fake.invokeCalls).toEqual([]); // retry was cancelled
  });

  it("keepAliveOnUnmount: lets the mid-backoff retry finish and reach the server", async () => {
    const h = mountLeaver(true);
    await Promise.resolve(); // first attempt fails, enters backoff sleep
    h.destroy(); // NOT aborted
    await tick(60); // backoff elapses, retry runs
    await Promise.resolve();
    expect(h.fake.invokeCalls).toEqual([{ method: "LeaveRoomAsync", args: ["room-1"] }]);
    h.fake.resolveInvoke();
  });
});

// 2. A teardown issued in DestroyRef.onDestroy while the hub is still
//    connecting must QUEUE and flush on connect, not drop. It must also
//    survive the injection scope's destruction.
describe("injectHubTeardown queue-while-connecting", () => {
  it("queues the send until connected, then flushes, surviving destroy", async () => {
    const h = makeHarness({ startConnected: false }); // still connecting

    h.run(() => {
      const teardown = h.hooks.injectHubTeardown(HUB, "LeaveRoomAsync");
      inject(DestroyRef).onDestroy(() => {
        void teardown("room-1"); // fires while NOT yet connected
      });
    });

    h.destroy();

    // Not connected yet: must NOT have dropped. Nothing sent yet, but it is waiting.
    expect(h.fake.sendCalls).toEqual([]);
    // It acquired the hub to hold it open past destroy.
    expect(h.acquireCount).toBeGreaterThan(h.releaseCount);

    // The connection comes up: the queued leave must flush.
    h.connect();
    await Promise.resolve();
    await Promise.resolve();

    expect(h.fake.sendCalls).toEqual([{ method: "LeaveRoomAsync", args: ["room-1"] }]);
    // It released the hub after flushing.
    expect(h.releaseCount).toBe(h.acquireCount);
  });

  it("contrast: injectHubSend drops while connecting", async () => {
    const h = makeHarness({ startConnected: false });

    h.run(() => {
      const send = h.hooks.injectHubSend(HUB, "LeaveRoomAsync");
      inject(DestroyRef).onDestroy(() => {
        void send("room-1");
      });
    });

    h.destroy();

    // Even after connecting, the dropped send never flushes — it resolved false.
    h.connect();
    await Promise.resolve();
    expect(h.fake.sendCalls).toEqual([]);
  });
});
