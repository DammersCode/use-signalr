// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { ChatRoom } from "./quick-start";
import type { ChatMessage } from "./contract";

const mocks = vi.hoisted(() => ({
  onMessage: undefined as ((message: ChatMessage) => void) | undefined,
  sendMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./provider", () => ({
  session: {
    hub: () => ({
      status: "connected",
      on: (_event: string, handler: (message: ChatMessage) => void) => {
        mocks.onMessage = handler;
        return () => {};
      },
      invoke: () => mocks.sendMessage,
    }),
  },
}));

describe("ChatRoom", () => {
  it("shows a received message and sends one", async () => {
    const room = new ChatRoom();
    document.body.append(room);
    await room.updateComplete;

    mocks.onMessage?.({ roomId: "general", user: "Ada", text: "Hi", sentAt: "1" });
    await room.updateComplete;
    expect(room.shadowRoot?.textContent).toContain("Ada: Hi");

    room.shadowRoot?.querySelector("button")?.click();
    expect(mocks.sendMessage).toHaveBeenCalledWith("general", "Hello");
  });
});
