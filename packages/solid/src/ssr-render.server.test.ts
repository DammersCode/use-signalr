import { createComponent } from "solid-js";
import { renderToString, isServer } from "solid-js/web";
import { describe, it, expect, vi } from "vitest";
import { createSignalRClient, event, method } from "./index.js";

const HUB = "/hubs/chat" as const;
const build = vi.fn();

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
      build();
      return {};
    }
  },
  HubConnectionState: { Disconnected: "Disconnected", Connected: "Connected" },
  LogLevel: { Information: 2 },
}));

describe("server render with the solid-js server build", () => {
  it("renders the initial status and opens no connection", () => {
    expect(isServer).toBe(true);
    const client = createSignalRClient({
      hubs: {
        [HUB]: {
          events: { Message: event<[text: string]>() },
          methods: { Ping: method<[], string>() },
        },
      },
    });
    const Probe = () => {
      client.useSignalREffect(HUB, "Message", () => {});
      return client.useHubStatus(HUB)();
    };

    const html = renderToString(() =>
      createComponent(client.SignalRProvider, {
        baseUrl: "https://example.test",
        accessTokenFactory: () => "t",
        get children() {
          return createComponent(Probe, {});
        },
      }),
    );

    expect(html).toBe("idle");
    expect(build).not.toHaveBeenCalled();
  });
});
