import { afterEach, expect, it, vi } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { Room } from "./quick-start";

const sendMessage = vi.fn().mockResolvedValue(undefined);

vi.mock("./client", () => ({
  useHubStatus: () => "connected",
  useSignalREffect: vi.fn(),
  useSignalRInvoke: () => sendMessage,
}));

const container = document.createElement("div");

afterEach(() => render(null, container));

it("sends a message to the room", async () => {
  await act(() => render(<Room roomId="general" />, container));

  await act(() => container.querySelector("button")!.click());

  expect(sendMessage).toHaveBeenCalledWith("general", "Hello");
});
