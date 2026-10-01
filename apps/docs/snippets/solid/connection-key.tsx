import type { Component } from "solid-js";
import { render } from "solid-js/web";

declare const App: Component;
declare const userId: () => string;
declare const loginCount: () => number;
declare const getToken: () => Promise<string>;
// ---cut---
import { SignalRProvider } from "./client";

render(
  () => (
    <SignalRProvider
      baseUrl="https://api.example.com"
      accessTokenFactory={getToken}
      connectionKey={`${userId()}:${loginCount()}`}
    >
      <App />
    </SignalRProvider>
  ),
  document.getElementById("root")!,
);
