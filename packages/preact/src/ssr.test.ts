// @vitest-environment node
import { h } from "preact";
import renderToString from "preact-render-to-string";
import { describe, expect, it, vi } from "vitest";

const build = vi.fn();

vi.mock("@microsoft/signalr", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@microsoft/signalr")>();
  return {
    ...actual,
    HubConnectionBuilder: class {
      withUrl() { return this; }
      configureLogging() { return this; }
      withAutomaticReconnect() { return this; }
      build() { build(); throw new Error("SSR must not build a connection"); }
    },
  };
});

describe("SSR", () => {
  it("imports and renders the provider without starting a connection", async () => {
    expect(typeof globalThis.window).toBe("undefined");
    const mod = await import("./index.js");
    const client = mod.createSignalRClient({ hubs: { "/hub": {} } });
    expect(renderToString(h(client.SignalRProvider, {
      baseUrl: "https://example.test",
      accessTokenFactory: () => "token",
      children: h("main", null, "SSR"),
    }))).toContain("SSR");
    expect(build).not.toHaveBeenCalled();
  });
});
