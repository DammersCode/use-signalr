// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

describe("SSR", () => {
  it("creates and installs a client without building a connection", async () => {
    expect(typeof globalThis.window).toBe("undefined");
    const build = vi.fn();
    vi.doMock("@microsoft/signalr", () => ({
      HubConnectionBuilder: class {
        build() {
          build();
          return {};
        }
      },
      LogLevel: { Information: 2 },
    }));
    const { createSSRApp } = await import("vue");
    const { createSignalRClient, event } = await import("./index.js");
    const client = createSignalRClient({ hubs: { "/hub": { events: { Tick: event<[]>() } } } });
    createSSRApp({ render: () => null }).use(client, {
      baseUrl: "https://example.test",
      accessTokenFactory: () => "token",
    });
    expect(build).not.toHaveBeenCalled();
    vi.doUnmock("@microsoft/signalr");
  });

  it("exposes every documented package export", async () => {
    const mod = await import("./index.js");
    for (const name of ["createSignalRClient", "event", "method", "InvokeError"]) {
      expect(mod, `missing export: ${name}`).toHaveProperty(name);
    }
  });
});
