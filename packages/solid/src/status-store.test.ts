import { expect, it } from "vitest";
import { createStatusStore } from "./status-store.js";

it("reads the new status right after a write", () => {
  const store = createStatusStore<"/hub">();
  expect(store.get("/hub")).toBe("idle");
  store.set("/hub", "connecting");
  expect(store.get("/hub")).toBe("connecting");
});
