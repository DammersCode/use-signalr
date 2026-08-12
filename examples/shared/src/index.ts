import { event, method } from "@dammers/use-signalr-core";

/** Backend base URL for all example apps. Matches examples/server/Program.cs. */
export const BASE_URL = "http://localhost:5299";

/** Shared hub contract, matching examples/server/Hubs exactly. */
export const hubs = {
  "/hubs/chat": {
    events: {
      Tick: event<[count: number, at: string]>(),
      Echoed: event<[text: string, at: string]>(),
      Left: event<[connectionId: string]>(),
    },
    methods: {
      Echo: method<[text: string], string>(),
      Add: method<[a: number, b: number], number>(),
      SlowEcho: method<[text: string, delayMs: number], string>(),
      Fail: method<[], void>(),
      Ping: method<[], void>(),
      Leave: method<[], void>(),
      KillConnection: method<[], void>(),
      ConnectionId: method<[], string>(),
    },
  },
  "/hubs/counter": {
    lazy: true,
    graceMs: 3000,
    events: {
      Count: event<[value: number]>(),
    },
    methods: {
      Reset: method<[], void>(),
    },
  },
};

/** Prints the shared example console protocol, prefixed `[use-signalr:<framework>]`. */
export function createLogger(framework: string) {
  const prefix = `[use-signalr:${framework}]`;
  const log = (message: string) => console.log(`${prefix} ${message}`);

  return {
    status: (hub: string, status: string) => log(`status ${hub}: ${status}`),
    tick: (n: number) => log(`tick ${n}`),
    count: (n: number) => log(`count ${n}`),
    result: (name: string, value: unknown) => log(`${name} -> ${value}`),
    invokeFailed: (err: { attempts?: number; retriable?: boolean }) =>
      log(`invoke failed: attempts=${err.attempts} retriable=${err.retriable}`),
    sent: (name: string, ok: boolean) => log(`${name} sent: ${ok}`),
    echoed: (text: string, at: string) => log(`echoed ${text} at ${at}`),
    left: (connectionId: string) => log(`left ${connectionId}`),
    reconnected: () => log("reconnected"),
    log,
  };
}

let tokenCount = 0;

/** Returns a fake per-negotiate bearer token, proving token reads are per-connect. */
export function makeToken(framework: string): () => string {
  const { log } = createLogger(framework);
  return () => {
    tokenCount++;
    log(`token read #${tokenCount}`);
    return `${framework}-token-${tokenCount}`;
  };
}
