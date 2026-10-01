declare function useAuth(): { isSignedIn: boolean; getToken: () => Promise<string> };
// ---cut---
import type { ComponentChildren } from "preact";
import { SignalRProvider } from "./client";

export function Providers({ children }: { children: ComponentChildren }) {
  const { isSignedIn, getToken } = useAuth();

  return (
    <SignalRProvider
      baseUrl="https://api.example.com"
      accessTokenFactory={getToken}
      enabled={isSignedIn}
    >
      {children}
    </SignalRProvider>
  );
}
