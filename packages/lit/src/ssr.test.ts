// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createSignalRClient } from "./create-signalr-client";
import type { ReactiveControllerHost } from "lit";

describe("SSR", () => {
  it("does not start a connection during import or controller construction", () => {
    expect(typeof globalThis.window).toBe("undefined");
    const client = createSignalRClient({ hubs: { "/hub": {} } });
    const session = client.createSession({
      baseUrl: "https://example.test",
      accessTokenFactory: () => "",
    });
    const host = {
      addController: vi.fn(),
      removeController: vi.fn(),
      requestUpdate: vi.fn(),
      updateComplete: Promise.resolve(true),
    } satisfies ReactiveControllerHost;

    session.hub(host, "/hub", { reactiveStatus: true });

    expect(host.addController).toHaveBeenCalledTimes(1);
    expect(session.context.getConnection("/hub")).toBeNull();
    expect(host.requestUpdate).not.toHaveBeenCalled();
  });
});
