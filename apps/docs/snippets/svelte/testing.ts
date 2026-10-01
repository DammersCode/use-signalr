import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import QuickStart from "./quick-start.svelte";

const sendMessage = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("./client", async () => {
  const { readable } = await import("svelte/store");
  return {
    hubStatus: () => readable("connected"),
    onHubEvent: vi.fn(),
    hubInvoke: () => sendMessage,
  };
});

describe("QuickStart", () => {
  it("sends the typed text to the room", async () => {
    render(QuickStart, { props: { roomId: "general" } });

    await fireEvent.input(screen.getByRole("textbox"), { target: { value: "hello" } });
    await fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(sendMessage).toHaveBeenCalledWith("general", "hello");
  });
});
