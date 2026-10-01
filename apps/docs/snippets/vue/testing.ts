import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import QuickStart from "./quick-start.vue";

const sendMessage = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("./client", async () => {
  const { ref } = await import("vue");
  return {
    useHubStatus: () => ref("connected"),
    useSignalREvent: vi.fn(),
    useSignalRInvoke: () => sendMessage,
  };
});

describe("QuickStart", () => {
  it("sends the typed text to the room", async () => {
    const wrapper = mount(QuickStart, { props: { roomId: "general" } });

    await wrapper.find("input").setValue("hello");
    await wrapper.find("form").trigger("submit");

    expect(sendMessage).toHaveBeenCalledWith("general", "hello");
  });
});
