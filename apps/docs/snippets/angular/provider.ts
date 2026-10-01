import { Injectable, inject, signal } from "@angular/core";
import type { ApplicationConfig } from "@angular/core";
import { provideSignalR } from "./client";

@Injectable({ providedIn: "root" })
class AuthService {
  token = signal("");
  isLoggedIn = signal(false);
}
// ---cut---
export const appConfig: ApplicationConfig = {
  providers: [
    provideSignalR(() => {
      const auth = inject(AuthService);
      return {
        baseUrl: "https://api.example.com",
        accessTokenFactory: () => auth.token(),
        enabled: auth.isLoggedIn,
        onError: (hub, error, info) => console.error(hub, info.source, error),
      };
    }),
  ],
};
