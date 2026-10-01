declare function useAuth(): { isSignedIn: boolean; getToken: () => Promise<string> };
// ---cut---
"use client";

import type { ReactNode } from "react";
import { SignalRProvider } from "./client";

export function Providers({ children }: { children: ReactNode }) {
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
