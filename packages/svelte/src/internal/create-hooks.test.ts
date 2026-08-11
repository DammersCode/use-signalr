import { onDestroy } from "svelte";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import Runner from "./test-components/Runner.svelte";
import { makeHarness } from "./test-harness.js";

const HUB = "/hubs/chat" as const;
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 1. A retrying invoke that is mid-backoff when the component is destroyed:
//    - DEFAULT: destroying aborts the backoff, so the retry never reaches the
//      server (the in-flight call is cancelled).
//    - keepAliveOnUnmount: the backoff is NOT aborted, the retry proceeds and
//      the call reaches the server.
describe("hubInvoke keepAliveOnUnmount", () => {
  function mountLeaver(keepAlive: boolean) {
    const h = makeHarness({ startConnected: true, failWaitOnce: true });
    const view = render(Runner, {
      props: {
        run: () => {
          const leave = h.hooks.hubInvoke(HUB, "LeaveRoomAsync", {
            retries: 1,
            backoff: [30], // first attempt fails -> 30ms backoff -> retry
            keepAliveOnUnmount: keepAlive,
          });
          leave("room-1").catch(() => {}); // start during init
        },
      },
      context: h.context,
    });
    return { h, view };
  }

  it("DEFAULT: aborts the mid-backoff retry on destroy (call never reaches server)", async () => {
    const { h, view } = mountLeaver(false);
    await Promise.resolve(); // first attempt fails, enters backoff sleep
    view.unmount(); // abort fires during the 30ms backoff
    await tick(60); // past when the retry would have run
    expect(h.fake.invokeCalls).toEqual([]); // retry was cancelled
  });

  it("keepAliveOnUnmount: lets the mid-backoff retry finish and reach the server", async () => {
    const { h, view } = mountLeaver(true);
    await Promise.resolve(); // first attempt fails, enters backoff sleep
    view.unmount(); // NOT aborted
    await tick(60); // backoff elapses, retry runs
    await Promise.resolve();
    expect(h.fake.invokeCalls).toEqual([{ method: "LeaveRoomAsync", args: ["room-1"] }]);
    h.fake.resolveInvoke();
  });
});

// 2. A teardown issued in onDestroy while the hub is still connecting must
//    QUEUE and flush on connect, not drop. It must also survive the
//    component's destruction.
describe("hubTeardown queue-while-connecting", () => {
  it("queues the send until connected, then flushes, surviving destroy", async () => {
    const h = makeHarness({ startConnected: false }); // still connecting

    const view = render(Runner, {
      props: {
        run: () => {
          const teardown = h.hooks.hubTeardown(HUB, "LeaveRoomAsync");
          onDestroy(() => {
            void teardown("room-1"); // fires while NOT yet connected
          });
        },
      },
      context: h.context,
    });

    view.unmount();

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

  it("contrast: hubSend drops while connecting", async () => {
    const h = makeHarness({ startConnected: false });

    const view = render(Runner, {
      props: {
        run: () => {
          const send = h.hooks.hubSend(HUB, "LeaveRoomAsync");
          onDestroy(() => {
            void send("room-1");
          });
        },
      },
      context: h.context,
    });

    view.unmount();

    // Even after connecting, the dropped send never flushes — it resolved false.
    h.connect();
    await Promise.resolve();
    expect(h.fake.sendCalls).toEqual([]);
  });
});
