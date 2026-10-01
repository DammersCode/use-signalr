import { createSSRApp, defineAsyncComponent, defineComponent, h, nextTick, Suspense } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSignalRClient } from "../create-signalr-client.js";

const HUB = "/hubs/chat" as const;
const connections: Array<{ state: string; start: () => Promise<void> }> = [];

vi.mock("@microsoft/signalr", () => ({
  HubConnectionBuilder: class {
    withUrl() { return this; }
    configureLogging() { return this; }
    withAutomaticReconnect() { return this; }
    build() {
      const conn = {
        state: "Disconnected",
        start: vi.fn(() => { conn.state = "Connected"; return Promise.resolve(); }),
        stop: vi.fn(() => Promise.resolve()),
        on: vi.fn(),
        off: vi.fn(),
        onclose: vi.fn(),
        onreconnecting: vi.fn(),
        onreconnected: vi.fn(),
      };
      connections.push(conn);
      return conn;
    }
  },
  HubConnectionState: { Disconnected: "Disconnected", Connecting: "Connecting", Connected: "Connected", Disconnecting: "Disconnecting", Reconnecting: "Reconnecting" },
  LogLevel: { Information: 2 },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  connections.length = 0;
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

type Variant = "sync" | "suspense" | "async-component";

function makeApp(variant: Variant = "sync") {
  const client = createSignalRClient({ hubs: { [HUB]: {} } });
  const Page = defineComponent({
    setup() {
      const status = client.useHubStatus(HUB);
      return () => h("p", status.value);
    },
  });
  const AsyncPage = defineComponent({
    async setup() {
      const status = client.useHubStatus(HUB);
      await tick();
      return () => h("p", status.value);
    },
  });
  const Lazy = defineAsyncComponent(async () => {
    await tick();
    return Page;
  });
  const roots = {
    sync: () => h(Page),
    suspense: () => h(Suspense, null, { default: () => h(AsyncPage) }),
    "async-component": () => h(Suspense, null, { default: () => h(Lazy) }),
  };
  const app = createSSRApp({ render: roots[variant] });
  app.use(client, { baseUrl: "https://example.test", accessTokenFactory: () => "token" });
  return app;
}

describe("SSR hydration", () => {
  it("hydrates the idle server status without a mismatch, then connects", async () => {
    vi.stubGlobal("window", undefined);
    const html = await renderToString(makeApp());
    vi.unstubAllGlobals();
    expect(html).toBe("<p>idle</p>");
    expect(connections).toHaveLength(0);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const host = document.createElement("div");
    host.innerHTML = html;
    const app = makeApp();
    app.mount(host);

    expect(warn).not.toHaveBeenCalled();
    expect(host.textContent).toBe("idle");
    expect(connections).toHaveLength(1);
    await nextTick();
    await nextTick();
    expect(host.textContent).toBe("connected");
    app.unmount();
  });

  it.each(["suspense", "async-component"] as const)(
    "hydrates an %s component idle, then shows the live status",
    async (variant) => {
      vi.stubGlobal("window", undefined);
      const html = await renderToString(makeApp(variant));
      vi.unstubAllGlobals();
      expect(html).toContain("<p>idle</p>");

      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const host = document.createElement("div");
      host.innerHTML = html;
      const app = makeApp(variant);
      app.mount(host);
      await tick();
      await tick();
      await nextTick();

      expect(warn).not.toHaveBeenCalled();
      expect(host.textContent).toBe("connected");
      app.unmount();
    },
  );
});
