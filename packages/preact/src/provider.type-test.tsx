import { createSignalRClient } from "./create-signalr-client.js";
import { event } from "@dammers/use-signalr-core";

const { SignalRProvider, useSignalREffect } = createSignalRClient({
  hubs: { "/hubs/chat": { events: { OnFoo: event<[x: number]>() } } },
});

function Child() {
  useSignalREffect("/hubs/chat", "OnFoo", (x) => { const n: number = x; void n; });
  return null;
}

export const valid = (
  <SignalRProvider baseUrl="https://example.test" accessTokenFactory={() => "t"} connectionKey={1} enabled>
    <Child />
  </SignalRProvider>
);

// @ts-expect-error accessTokenFactory is required
export const missingToken = <SignalRProvider baseUrl="https://example.test"><Child /></SignalRProvider>;
