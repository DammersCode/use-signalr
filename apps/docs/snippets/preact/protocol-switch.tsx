import { useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { createSignalRClient } from "@dammers/use-signalr-preact";
import { JsonHubProtocol } from "@microsoft/signalr";
import { MessagePackHubProtocol } from "@microsoft/signalr-protocol-msgpack";
import { hubs } from "./contract";

declare function getToken(): Promise<string>;

let useBinary = true;

const { SignalRProvider } = createSignalRClient({
  hubs,
  hubProtocol: () => (useBinary ? new MessagePackHubProtocol() : new JsonHubProtocol()),
});

export function Providers({ children }: { children: ComponentChildren }) {
  const [rebuilds, setRebuilds] = useState(0);

  function switchProtocol(binary: boolean) {
    useBinary = binary;
    setRebuilds((count) => count + 1);
  }

  return (
    <SignalRProvider baseUrl="https://api.example.com" accessTokenFactory={getToken} connectionKey={String(rebuilds)}>
      <button onClick={() => switchProtocol(!useBinary)}>Switch protocol</button>
      {children}
    </SignalRProvider>
  );
}
