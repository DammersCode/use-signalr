import type { ApplicationConfig } from "@angular/core";
import { BASE_URL, makeToken } from "@examples/contract";
import { provideSignalR } from "./client.js";

export const appConfig: ApplicationConfig = {
  providers: [
    provideSignalR({
      baseUrl: BASE_URL,
      accessTokenFactory: makeToken("angular"),
    }),
  ],
};
