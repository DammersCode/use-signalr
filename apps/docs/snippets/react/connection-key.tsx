declare function useAuth(): {
  userId: string;
  loginCount: number;
  getToken: () => Promise<string>;
};
// ---cut---
"use client";

import type { ReactNode } from "react";
import { SignalRProvider } from "./client";

export function Providers({ children }: { children: ReactNode }) {
  const { userId, loginCount, getToken } = useAuth();

  return (
    <SignalRProvider
      baseUrl="https://api.example.com"
      accessTokenFactory={getToken}
      connectionKey={`${userId}:${loginCount}`}
    >
      {children}
    </SignalRProvider>
  );
}
