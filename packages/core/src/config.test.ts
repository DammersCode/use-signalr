import { describe, expect, it } from "vitest";
import { HttpError } from "@microsoft/signalr";
import { FailedToNegotiateWithServerError } from "@microsoft/signalr/dist/esm/Errors.js";
import { HttpTransportType, TransferFormat } from "@microsoft/signalr";
import type { HubConnectionBuilder, IHubProtocol } from "@microsoft/signalr";
import { isRetriableConnectError, resolveHubConfig } from "./config.js";

describe("isRetriableConnectError", () => {
  it("returns false for plain HttpError 401", () => {
    const err = new HttpError("Unauthorized", 401);
    expect(isRetriableConnectError(err)).toBe(false);
  });

  it("returns false for wrapped 401 negotiate error", () => {
    const httpErr = new HttpError("Unauthorized", 401);
    const err = new FailedToNegotiateWithServerError(
      "Failed to complete negotiation with the server: " + httpErr
    );
    expect(isRetriableConnectError(err)).toBe(false);
  });

  it("returns true for wrapped 500 negotiate error", () => {
    const httpErr = new HttpError("Internal Server Error", 500);
    const err = new FailedToNegotiateWithServerError(
      "Failed to complete negotiation with the server: " + httpErr
    );
    expect(isRetriableConnectError(err)).toBe(true);
  });

  it("returns true for wrapped error with no status code", () => {
    const err = new FailedToNegotiateWithServerError(
      "Failed to complete negotiation with the server: Some error without status code"
    );
    expect(isRetriableConnectError(err)).toBe(true);
  });
});

describe("resolveHubConfig: httpOptions", () => {
  const hubs = { "/hubs/a": {} };

  it("lets per-hub values override global values per key", () => {
    const rc = resolveHubConfig(
      {
        hubs: { "/hubs/a": { httpOptions: { transport: HttpTransportType.WebSockets } } },
        httpOptions: { transport: HttpTransportType.LongPolling, skipNegotiation: false },
      },
      "/hubs/a",
    );
    expect(rc.httpOptions).toEqual({
      transport: HttpTransportType.WebSockets,
      skipNegotiation: false,
    });
  });

  it("merges headers by name, and the per-hub header wins", () => {
    const rc = resolveHubConfig(
      {
        hubs: { "/hubs/a": { httpOptions: { headers: { B: "hub", C: "hub" } } } },
        httpOptions: { headers: { A: "global", B: "global" } },
      },
      "/hubs/a",
    );
    expect(rc.httpOptions.headers).toEqual({ A: "global", B: "hub", C: "hub" });
  });

  it("returns an empty object when no httpOptions are set", () => {
    expect(resolveHubConfig({ hubs }, "/hubs/a").httpOptions).toEqual({});
  });
});

function fakeProtocol(transferFormat: TransferFormat): IHubProtocol {
  return {
    name: "fake",
    version: 1,
    transferFormat,
    parseMessages: () => [],
    writeMessage: () => "",
  };
}

describe("resolveHubConfig: hubProtocol and configureBuilder", () => {
  const hubs = { "/hubs/a": {} };

  it("has no protocol and no builder hooks by default", () => {
    const rc = resolveHubConfig({ hubs }, "/hubs/a");
    expect(rc.hubProtocol).toBeUndefined();
    expect(rc.configureBuilders).toEqual([]);
  });

  it("uses the global protocol, and the per-hub protocol wins", () => {
    const global = fakeProtocol(TransferFormat.Text);
    const own = fakeProtocol(TransferFormat.Text);
    expect(resolveHubConfig({ hubs, hubProtocol: global }, "/hubs/a").hubProtocol).toBe(global);
    const ownHubs = { "/hubs/a": { hubProtocol: own } };
    expect(resolveHubConfig({ hubs: ownHubs, hubProtocol: global }, "/hubs/a").hubProtocol).toBe(own);
  });

  it("keeps a factory as a factory", () => {
    const factory = () => fakeProtocol(TransferFormat.Binary);
    expect(resolveHubConfig({ hubs, hubProtocol: factory }, "/hubs/a").hubProtocol).toBe(factory);
  });

  it("orders the builder hooks global first, then per hub", () => {
    const global = (b: HubConnectionBuilder) => b;
    const own = (b: HubConnectionBuilder) => b;
    const rc = resolveHubConfig(
      { hubs: { "/hubs/a": { configureBuilder: own } }, configureBuilder: global },
      "/hubs/a",
    );
    expect(rc.configureBuilders).toEqual([global, own]);
  });
});

describe("resolveHubConfig: binary protocol with SSE", () => {
  const binary = fakeProtocol(TransferFormat.Binary);
  const sse = { transport: HttpTransportType.ServerSentEvents };

  it("throws for a binary protocol instance with SSE only, and names the hub", () => {
    const hubs = { "/hubs/a": { hubProtocol: binary, httpOptions: sse } };
    expect(() => resolveHubConfig({ hubs }, "/hubs/a")).toThrow(/\/hubs\/a.*Server-Sent Events.*binary/s);
  });

  it("throws when the global protocol and the global SSE option meet", () => {
    const hubs = { "/hubs/a": {} };
    expect(() => resolveHubConfig({ hubs, hubProtocol: binary, httpOptions: sse }, "/hubs/a")).toThrow(
      /Server-Sent Events/,
    );
  });

  it("does not throw for a factory", () => {
    const hubs = { "/hubs/a": {} };
    expect(() =>
      resolveHubConfig({ hubs, hubProtocol: () => binary, httpOptions: sse }, "/hubs/a"),
    ).not.toThrow();
  });

  it.each([
    ["WebSockets", HttpTransportType.WebSockets],
    ["LongPolling", HttpTransportType.LongPolling],
    ["a flag set with WebSockets", HttpTransportType.ServerSentEvents | HttpTransportType.WebSockets],
    ["a flag set with LongPolling", HttpTransportType.ServerSentEvents | HttpTransportType.LongPolling],
  ])("accepts %s", (_name, transport) => {
    const hubs = { "/hubs/a": {} };
    expect(() =>
      resolveHubConfig({ hubs, hubProtocol: binary, httpOptions: { transport } }, "/hubs/a"),
    ).not.toThrow();
  });

  it("accepts a text protocol with SSE", () => {
    const hubs = { "/hubs/a": {} };
    expect(() =>
      resolveHubConfig({ hubs, hubProtocol: fakeProtocol(TransferFormat.Text), httpOptions: sse }, "/hubs/a"),
    ).not.toThrow();
  });
});

describe("resolveHubConfig: hub key", () => {
  it("reads the per-hub config of the given key", () => {
    const rc = resolveHubConfig(
      { hubs: { "/hubs/a": { lazy: false }, "/hubs/b": { lazy: true, graceMs: 50, events: { OnFoo: {} } } } },
      "/hubs/b",
    );
    expect(rc).toMatchObject({ lazy: true, graceMs: 50, events: ["OnFoo"] });
  });

  it("names the hub of the key in the SSE error", () => {
    const binary = fakeProtocol(TransferFormat.Binary);
    const hubs = {
      "/hubs/a": {},
      "/hubs/b": { hubProtocol: binary, httpOptions: { transport: HttpTransportType.ServerSentEvents } },
    };
    expect(() => resolveHubConfig({ hubs }, "/hubs/b")).toThrow(/"\/hubs\/b"/);
  });
});

describe("resolveHubConfig: removed keys", () => {
  const removed = [
    ["transport", "httpOptions"],
    ["skipNegotiation", "httpOptions"],
    ["maxConnectRetries", "retr"],
  ] as const;

  it.each(removed)("throws for the global %s key", (key, hint) => {
    const config = { hubs: { "/hubs/a": {} }, [key]: 1 };
    expect(() => resolveHubConfig(config, "/hubs/a")).toThrow(new RegExp(`${key}.*${hint}`, "s"));
  });

  it.each(removed)("throws for the per-hub %s key and names the hub", (key, hint) => {
    const config = { hubs: { "/hubs/a": {}, "/hubs/b": { [key]: 1 } } };
    expect(() => resolveHubConfig(config, "/hubs/b")).toThrow(
      new RegExp(`/hubs/b.*${key}.*${hint}`, "s"),
    );
    expect(() => resolveHubConfig(config, "/hubs/a")).not.toThrow();
  });
});

describe("resolveHubConfig: skipNegotiation", () => {
  const hubs = { "/hubs/a": {} };

  it.each([
    ["no transport", {}],
    ["LongPolling", { transport: HttpTransportType.LongPolling }],
    ["a flag set with WebSockets", { transport: HttpTransportType.WebSockets | HttpTransportType.LongPolling }],
  ])("throws for skipNegotiation with %s, and names the hub", (_name, extra) => {
    const httpOptions = { skipNegotiation: true, ...extra };
    expect(() => resolveHubConfig({ hubs, httpOptions }, "/hubs/a")).toThrow(
      'Hub "/hubs/a": skipNegotiation needs httpOptions.transport = HttpTransportType.WebSockets.',
    );
  });

  it("throws when the global skipNegotiation meets a per-hub transport that is not WebSockets", () => {
    const config = {
      hubs: { "/hubs/a": { httpOptions: { transport: HttpTransportType.LongPolling } } },
      httpOptions: { skipNegotiation: true },
    };
    expect(() => resolveHubConfig(config, "/hubs/a")).toThrow(/skipNegotiation needs/);
  });

  it("accepts skipNegotiation with WebSockets", () => {
    const httpOptions = { skipNegotiation: true, transport: HttpTransportType.WebSockets };
    expect(() => resolveHubConfig({ hubs, httpOptions }, "/hubs/a")).not.toThrow();
  });

  it("accepts skipNegotiation false with any transport", () => {
    const httpOptions = { skipNegotiation: false, transport: HttpTransportType.LongPolling };
    expect(() => resolveHubConfig({ hubs, httpOptions }, "/hubs/a")).not.toThrow();
  });
});
