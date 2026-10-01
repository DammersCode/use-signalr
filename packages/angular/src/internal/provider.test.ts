import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ApplicationRef,
  EnvironmentInjector,
  ErrorHandler,
  InjectionToken,
  createEnvironmentInjector,
  inject,
  runInInjectionContext,
  signal,
} from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createSignalRClient } from "../create-signalr-client.js";
import { createStatusStore } from "../status-store.js";

const HUB = "/hubs/chat" as const;
const tick = () => new Promise((r) => setTimeout(r, 0));

let builds = 0;
let startResolvers: Array<() => void> = [];
let fakeConnection: ReturnType<typeof makeFakeConnection>;

function makeFakeConnection() {
  return {
    on: vi.fn(),
    off: vi.fn(),
    start: vi.fn(() => new Promise<void>((resolve) => startResolvers.push(resolve))),
    stop: vi.fn(() => Promise.resolve()),
    onclose: vi.fn(),
    onreconnecting: vi.fn(),
    onreconnected: vi.fn(),
    state: "Disconnected",
  };
}

vi.mock("@microsoft/signalr", () => {
  class HubConnectionBuilder {
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
      builds += 1;
      return fakeConnection;
    }
  }
  const HubConnectionState = {
    Disconnected: "Disconnected",
    Connecting: "Connecting",
    Connected: "Connected",
    Disconnecting: "Disconnecting",
    Reconnecting: "Reconnecting",
  };
  return { HubConnectionBuilder, HubConnectionState, LogLevel: { Information: 2 } };
});

async function flush(appRef: ApplicationRef) {
  appRef.tick();
  await tick();
  appRef.tick();
  await tick();
}

function makeClient() {
  return createSignalRClient({ hubs: { [HUB]: {} } });
}

beforeEach(() => {
  builds = 0;
  startResolvers = [];
  fakeConnection = makeFakeConnection();
});

describe("provideSignalR options factory", () => {
  it("runs the factory in an injection context", async () => {
    const AUTH_URL = new InjectionToken<string>("auth-url", {
      providedIn: "root",
      factory: () => "https://auth.test",
    });
    const { provideSignalR, injectSignalR } = makeClient();
    const seen: string[] = [];
    const parent = TestBed.inject(EnvironmentInjector);
    const injector = createEnvironmentInjector(
      [
        provideSignalR(() => {
          const url = inject(AUTH_URL);
          seen.push(url);
          return { baseUrl: url, accessTokenFactory: () => "t" };
        }),
      ],
      parent,
    );
    runInInjectionContext(injector, () => injectSignalR());
    await flush(TestBed.inject(ApplicationRef));
    expect(seen).toEqual(["https://auth.test"]);
    expect(fakeConnection.start).toHaveBeenCalledTimes(1);
    injector.destroy();
  });
});

describe("eager connect", () => {
  it("connects an eager hub with no consumer", async () => {
    const { provideSignalR } = makeClient();
    const parent = TestBed.inject(EnvironmentInjector);
    const injector = createEnvironmentInjector(
      [provideSignalR({ baseUrl: "https://example.test", accessTokenFactory: () => "t" })],
      parent,
    );
    await flush(TestBed.inject(ApplicationRef));
    expect(fakeConnection.start).toHaveBeenCalledTimes(1);
    injector.destroy();
  });
});

describe("value-based rebuild", () => {
  it("does not rebuild when a signal gets a new object with the same derived values", async () => {
    const { provideSignalR } = makeClient();
    const user = signal({ admin: true });
    const parent = TestBed.inject(EnvironmentInjector);
    const injector = createEnvironmentInjector(
      [
        provideSignalR({
          baseUrl: "https://example.test",
          accessTokenFactory: () => "t",
          enabled: () => user().admin,
        }),
      ],
      parent,
    );
    const appRef = TestBed.inject(ApplicationRef);
    await flush(appRef);
    expect(builds).toBe(1);

    user.set({ admin: true });
    await flush(appRef);
    expect(builds).toBe(1);

    user.set({ admin: false });
    await flush(appRef);
    expect(fakeConnection.stop).toHaveBeenCalled();
    injector.destroy();
  });
});

describe("default onError", () => {
  it("reports a throwing onStatusChange to ErrorHandler when no onError is given", async () => {
    const { provideSignalR } = makeClient();
    const handleError = vi.fn();
    const parent = TestBed.inject(EnvironmentInjector);
    const injector = createEnvironmentInjector(
      [
        { provide: ErrorHandler, useValue: { handleError } },
        provideSignalR({
          baseUrl: "https://example.test",
          accessTokenFactory: () => "t",
          onStatusChange: () => {
            throw new Error("boom");
          },
        }),
      ],
      parent,
    );
    await flush(TestBed.inject(ApplicationRef));
    expect(handleError).toHaveBeenCalledWith(expect.objectContaining({ message: "boom" }));
    injector.destroy();
  });

  it("prefers a user onError", async () => {
    const { provideSignalR } = makeClient();
    const handleError = vi.fn();
    const onError = vi.fn();
    const parent = TestBed.inject(EnvironmentInjector);
    const injector = createEnvironmentInjector(
      [
        { provide: ErrorHandler, useValue: { handleError } },
        provideSignalR({
          baseUrl: "https://example.test",
          accessTokenFactory: () => "t",
          onError,
          onStatusChange: () => {
            throw new Error("boom");
          },
        }),
      ],
      parent,
    );
    await flush(TestBed.inject(ApplicationRef));
    expect(onError).toHaveBeenCalled();
    expect(handleError).not.toHaveBeenCalled();
    injector.destroy();
  });
});

describe("status store", () => {
  it("returns a read-only signal", () => {
    const sig: object = createStatusStore<"a">().signal("a");
    expect("set" in sig).toBe(false);
  });
});
