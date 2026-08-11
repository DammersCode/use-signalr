import { createApp } from "vue";
import { describe, expect, it } from "vitest";
import { makeHarness } from "./test-harness";

const HUB = "/hubs/chat" as const;
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function inScope<T>(h: ReturnType<typeof makeHarness>, run: () => T) {
  const app = createApp({ render: () => null });
  app.provide(h.key, h.context);
  const scope = h.scope();
  const value = scope.run(() => app.runWithContext(run))!;
  return { scope, value };
}

describe("Vue composables", () => {
  it("provides the plugin context and balances consumer scopes", () => {
    const h = makeHarness();
    const first = inScope(h, () => h.hooks.useHubConsumer(HUB));
    const second = inScope(h, () => h.hooks.useHubConsumer(HUB));
    expect(h.acquireCount).toBe(2);
    first.scope.stop();
    expect(h.releaseCount).toBe(1);
    second.scope.stop();
    expect(h.releaseCount).toBe(2);
  });

  it("returns false from send while disconnected", async () => {
    const h = makeHarness();
    const { value: send, scope } = inScope(h, () => h.hooks.useSignalRSend(HUB, "LeaveRoomAsync"));
    await expect(send("room")).resolves.toBe(false);
    expect(h.sendCalls).toEqual([]);
    scope.stop();
  });

  it("keeps an invoke alive after scope disposal when requested", async () => {
    const h = makeHarness({ connected: true, failWaitOnce: true });
    const { value: leave, scope } = inScope(h, () => h.hooks.useSignalRInvoke(HUB, "LeaveRoomAsync", {
      retries: 1, backoff: [10], keepAliveOnUnmount: true, isRetriable: () => true,
    }));
    const pending = leave("room");
    await Promise.resolve();
    scope.stop();
    await tick(25);
    expect(h.invokeCalls).toEqual([{ method: "LeaveRoomAsync", args: ["room"] }]);
    h.resolveInvoke();
    await pending;
  });

  it("queues teardown until connected after its owning scope is disposed", async () => {
    const h = makeHarness();
    const { value: teardown, scope } = inScope(h, () => h.hooks.useSignalRTeardown(HUB, "LeaveRoomAsync"));
    scope.stop();
    const sent = teardown("room");
    expect(h.acquireCount).toBeGreaterThan(h.releaseCount);
    h.connect();
    await expect(sent).resolves.toBe(true);
    expect(h.sendCalls).toEqual([{ method: "LeaveRoomAsync", args: ["room"] }]);
    expect(h.releaseCount).toBe(h.acquireCount);
  });
});
