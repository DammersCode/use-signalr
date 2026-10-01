import { describe, it, expect, vi } from "vitest";
import { onDestroy } from "svelte";
import { render } from "svelte/server";
import { createSignalRClient, method } from "./index.js";
import Provider from "./internal/test-components/Provider.svelte";

vi.mock("@microsoft/signalr", () => ({
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
      return {};
    }
  },
  HubConnectionState: { Disconnected: "Disconnected", Connected: "Connected" },
  LogLevel: { Information: 2 },
}));

describe("render with the svelte server build", () => {
  it("resolves a teardown call in onDestroy at once", async () => {
    const client = createSignalRClient({
      hubs: { "/hubs/chat": { methods: { Leave: method<[room: string]>() } } },
    });

    let result: Promise<boolean> | undefined;
    const { body } = render(Provider, {
      props: {
        provide: client.provideSignalR,
        providerProps: { baseUrl: "https://example.test", accessTokenFactory: () => "token" },
        run: () => {
          const leave = client.hubTeardown("/hubs/chat", "Leave");
          onDestroy(() => {
            result = leave("room");
          });
        },
      },
    });

    expect(body).toBe("<!--[--><!--]-->");
    const outcome = await Promise.race([
      result,
      new Promise((resolve) => setTimeout(() => resolve("pending"), 1_000)),
    ]);
    expect(outcome).toBe(false);
  });
});
