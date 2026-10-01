import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Room } from "./quick-start";

const sendMessage = vi.fn().mockResolvedValue(undefined);

vi.mock("./client", () => ({
  useHubStatus: () => "connected",
  useSignalREffect: vi.fn(),
  useSignalRInvoke: () => sendMessage,
}));

afterEach(cleanup);

it("sends a message to the room", () => {
  render(<Room roomId="general" />);

  fireEvent.click(screen.getByRole("button", { name: "Say hello" }));

  expect(sendMessage).toHaveBeenCalledWith("general", "Hello");
});
