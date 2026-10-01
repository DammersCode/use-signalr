// @vitest-environment jsdom
import "@angular/compiler";
import { provideZonelessChangeDetection, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { RoomComponent } from "./quick-start";
import type { ChatMessage } from "./contract";

const mocks = vi.hoisted(() => ({
  onMessage: undefined as ((message: ChatMessage) => void) | undefined,
  sendMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  injectHubStatus: () => signal("connected"),
  injectHubEvent: (_hub: string, _event: string, handler: (message: ChatMessage) => void) => {
    mocks.onMessage = handler;
  },
  injectHubInvoke: () => mocks.sendMessage,
}));

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

describe("RoomComponent", () => {
  it("shows a received message and sends one", async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(RoomComponent);

    mocks.onMessage?.({ roomId: "general", user: "Ada", text: "Hi", sentAt: "1" });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain("Ada: Hi");

    fixture.componentInstance.send();
    expect(mocks.sendMessage).toHaveBeenCalledWith("general", "Hello");
  });
});
