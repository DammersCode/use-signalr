import type { Component } from "solid-js";
import { render } from "solid-js/web";

declare const App: Component;
declare const isSignedIn: () => boolean;
declare const getToken: () => Promise<string>;
// ---cut---
import { SignalRProvider } from "./client";

render(
  () => (
    <SignalRProvider
      baseUrl="https://api.example.com"
      accessTokenFactory={getToken}
      enabled={isSignedIn()}
    >
      <App />
    </SignalRProvider>
  ),
  document.getElementById("root")!,
);
