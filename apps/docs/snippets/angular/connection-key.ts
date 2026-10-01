import { Injectable, computed, inject, signal } from "@angular/core";
import { provideSignalR } from "./client";

@Injectable({ providedIn: "root" })
export class AuthService {
  userId = signal<string | undefined>(undefined);
  token = signal("");
  private logins = signal(0);
  isLoggedIn = computed(() => this.userId() !== undefined);
  connectionKey = computed(() => `${this.userId()}:${this.logins()}`);

  login(userId: string, token: string) {
    this.token.set(token);
    this.userId.set(userId);
    this.logins.update((count) => count + 1);
  }
}

export const signalRProviders = provideSignalR(() => {
  const auth = inject(AuthService);
  return {
    baseUrl: "https://api.example.com",
    accessTokenFactory: () => auth.token(),
    enabled: auth.isLoggedIn,
    connectionKey: auth.connectionKey,
  };
});
