import { createSignalRClient } from "@dammers/use-signalr-lit";
import { BASE_URL, hubs, makeToken } from "@examples/contract";

const signalR = createSignalRClient({ hubs });

export const session = signalR.createSession({
  baseUrl: BASE_URL,
  accessTokenFactory: makeToken("lit"),
});
