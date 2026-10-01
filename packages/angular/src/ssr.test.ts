// @vitest-environment node
//
// SSR safety: importing the package on the server must not touch browser
// globals or open a connection. Runs without a DOM on purpose — anything
// reaching for `window`/`WebSocket` at module scope throws here.
import { describe, it, expect, vi } from "vitest";

describe("SSR-safe import", () => {
  it("imports without a DOM present", async () => {
    expect(typeof globalThis.window).toBe("undefined");
    const mod = await import("./index.js");
    expect(typeof mod.createSignalRClient).toBe("function");
  }, 20_000);

  it("creates a client and calling provideSignalR builds NO connection", async () => {
    const build = vi.fn();
    // Without a module reset, the cached real signalr makes this test vacuous.
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

    expect(typeof client.provideSignalR).toBe("function");

    const providers = client.provideSignalR({
      baseUrl: "https://example.test",
      accessTokenFactory: () => "token",
    });
    expect(providers).toBeTruthy();

    // Instantiating the provider must also stay inert: on the server there is
    // no render pass, so afterNextRender never fires and nothing connects.
    expect(build).not.toHaveBeenCalled();
    vi.doUnmock("@microsoft/signalr");
  });

  it("exposes every documented export", async () => {
    const mod = await import("./index.js");
    for (const name of ["createSignalRClient", "event", "method"]) {
      expect(mod, `missing export: ${name}`).toHaveProperty(name);
    }
  });

  it("rxjs-interop entry point imports without a DOM present", async () => {
    const mod = await import("./rxjs-interop.js");
    expect(typeof mod.hubStatus$).toBe("function");
  }, 20_000);
});

describe("SSR provider", () => {
  it("disables the session so a constructor wait rejects at once and nothing connects", async () => {
    const build = vi.fn();
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
      HubConnectionState: { Disconnected: "Disconnected", Connected: "Connected" },
      LogLevel: { Information: 2 },
    }));
    await import("@angular/compiler");
    const {
      ErrorHandler,
      NgZone,
      PLATFORM_ID,
      createEnvironmentInjector,
      runInInjectionContext,
      EnvironmentInjector,
      Injector,
    } = await import("@angular/core");
    const { createSignalRClient, event, method } = await import("./index.js");
    const client = createSignalRClient({
      hubs: {
        "/hubs/chat": {
          events: { ReceiveMessage: event<[user: string]>() },
          methods: { SendMessage: method<[text: string]>() },
        },
      },
    });
    const root = Injector.create({ providers: [] }) as InstanceType<typeof EnvironmentInjector>;
    const injector = createEnvironmentInjector(
      [
        { provide: PLATFORM_ID, useValue: "server" },
        { provide: ErrorHandler, useValue: { handleError() {} } },
        { provide: NgZone, useValue: { run: (fn: () => unknown) => fn(), runOutsideAngular: (fn: () => unknown) => fn() } },
        client.provideSignalR({ baseUrl: "https://example.test", accessTokenFactory: () => "t" }),
      ],
      root,
    );
    const wait = runInInjectionContext(injector, () => client.injectSignalR()).waitForConnection(
      "/hubs/chat",
      10_000,
    );
    await expect(wait).rejects.toMatchObject({ name: "SignalRDisabledError" });
    expect(build).not.toHaveBeenCalled();
    vi.doUnmock("@microsoft/signalr");
  });
});
