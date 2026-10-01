import { createSignalRClient } from "@dammers/use-signalr-lit";
import { BASE_URL, createLogger, hubs, makeToken } from "@examples/contract";

const log = createLogger("lit");

const signalR = createSignalRClient({ hubs });

export const session = signalR.createSession({
  baseUrl: BASE_URL,
  accessTokenFactory: makeToken("lit"),
  onStatusChange: (hub, status) => {
    log.status(hub, status);
  },
});
