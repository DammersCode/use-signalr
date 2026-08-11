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

let tokenCount = 0;

/** Returns a fake per-negotiate bearer token, proving token reads are per-connect. */
export function makeToken(framework: string): () => string {
  return () => {
    tokenCount++;
    const token = `${framework}-token-${tokenCount}`;
    console.log(`[use-signalr:${framework}] token read #${tokenCount}`);
    return token;
  };
}
