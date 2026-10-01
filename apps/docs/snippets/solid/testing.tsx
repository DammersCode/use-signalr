import { expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { Room } from "./quick-start";

const sendMessage = vi.fn().mockResolvedValue(undefined);

vi.mock("./client", () => ({
  useHubStatus: () => () => "connected",
  useSignalREffect: vi.fn(),
  useSignalRInvoke: () => sendMessage,
}));

it("sends a message to the room", () => {
  render(() => <Room roomId="general" />);

  fireEvent.click(screen.getByRole("button", { name: "Say hello" }));

  expect(sendMessage).toHaveBeenCalledWith("general", "Hello");
});
