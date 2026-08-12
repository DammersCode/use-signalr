// @vitest-environment node
//
// SSR safety: importing the package on the server must not touch browser
// globals or open a connection. Runs without a DOM on purpose — anything
// reaching for `window`/`WebSocket` at module scope throws here.
//
// The provider connects inside createEffect, which does not run during an SSR
// render, so this test covers import safety and the no-build guarantee only.
import { describe, it, expect, vi } from "vitest";

describe("SSR-safe import", () => {
  it("imports without a DOM present", async () => {
    expect(typeof globalThis.window).toBe("undefined");
    const mod = await import("./index.js");
    expect(typeof mod.createSignalRClient).toBe("function");
  });

  it("creates a client without building a connection", async () => {
    const build = vi.fn();
    // Reset first: an earlier import caches the real signalr and voids the mock.
    vi.resetModules();
    vi.doMock("@microsoft/signalr", () => ({
      HubConnectionBuilder: class {
        withUrl() {
          return this;
        }
        configureLogging() {
          return this;
        }
        withAutomaticReconnect() {
          return this;
        }
        build() {
          build();
          return {};
        }
      },
      HubConnectionState: { Disconnected: "Disconnected" },
      LogLevel: { Information: 2 },
    }));

    const { createSignalRClient, event, method } = await import("./index.js");
    const client = createSignalRClient({
      hubs: {
        "/hubs/chat": {
          events: { ReceiveMessage: event<[user: string]>() },
          methods: { SendMessage: method<[text: string]>() },
        },
      },
    });

    expect(typeof client.SignalRProvider).toBe("function");
    expect(build).not.toHaveBeenCalled();
    vi.doUnmock("@microsoft/signalr");
  });

  it("exposes every documented export", async () => {
    const mod = await import("./index.js");
    for (const name of [
      "createSignalRClient",
      "event",
      "method",
      "InvokeError",
    ]) {
      expect(mod, `missing export: ${name}`).toHaveProperty(name);
    }
  });
});
