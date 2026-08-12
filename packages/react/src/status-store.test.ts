import { describe, it, expect, vi } from "vitest";
import { createStatusStore } from "./status-store.js";

describe("react status store", () => {
  it("notifies only the subscribers of the hub that changed", () => {
    const store = createStatusStore<"/a" | "/b">();
    const onA = vi.fn();
    const onB = vi.fn();
    store.subscribe("/a", onA);
    store.subscribe("/b", onB);

    store.set("/a", "connected");

    expect(onA).toHaveBeenCalledTimes(1);
    expect(onB).not.toHaveBeenCalled();
  });

  it("dedupes a repeated status and stops notifying after unsubscribe", () => {
    const store = createStatusStore<"/a">();
    const onA = vi.fn();
    const unsubscribe = store.subscribe("/a", onA);

    store.set("/a", "connected");
    store.set("/a", "connected");
    expect(onA).toHaveBeenCalledTimes(1);
    expect(store.get("/a")).toBe("connected");

    unsubscribe();
    store.set("/a", "reconnecting");
    expect(onA).toHaveBeenCalledTimes(1);
  });
});
