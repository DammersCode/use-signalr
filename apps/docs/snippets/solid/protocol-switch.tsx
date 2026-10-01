import { createSignal } from "solid-js";
import type { Component } from "solid-js";
import { render } from "solid-js/web";
import { createSignalRClient } from "@dammers/use-signalr-solid";
import { JsonHubProtocol } from "@microsoft/signalr";
import { MessagePackHubProtocol } from "@microsoft/signalr-protocol-msgpack";
import { hubs } from "./contract";

declare const App: Component;
declare const getToken: () => Promise<string>;

const [useBinary, setUseBinary] = createSignal(true);

const { SignalRProvider } = createSignalRClient({
  hubs,
  hubProtocol: () => (useBinary() ? new MessagePackHubProtocol() : new JsonHubProtocol()),
});

render(
  () => (
    <SignalRProvider baseUrl="https://api.example.com" accessTokenFactory={getToken} connectionKey={String(useBinary())}>
      <button onClick={() => setUseBinary(!useBinary())}>Switch protocol</button>
      <App />
    </SignalRProvider>
  ),
  document.getElementById("root")!,
);
