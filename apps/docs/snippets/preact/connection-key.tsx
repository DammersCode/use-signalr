declare function useAuth(): {
  userId: string;
  loginCount: number;
  getToken: () => Promise<string>;
};
// ---cut---
import type { ComponentChildren } from "preact";
import { SignalRProvider } from "./client";

export function Providers({ children }: { children: ComponentChildren }) {
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
