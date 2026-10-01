import { createSignalRClient } from "./adapter-sketch";
import { hubs } from "./contract";

const client = createSignalRClient({ hubs });
const provider = client.createProvider({
  baseUrl: "https://example.com",
  accessTokenFactory: () => "token",
});

// A client-only lifecycle hook runs this.
provider.update();

const stopListening = client.onEvent(provider.context, "/hubs/rooms", "MessageReceived", (message) => {
  console.log(message.user, message.text);
});

const calls = client.createCalls(provider.context, "/hubs/rooms", "GetHistory");
calls
  .invoke("general")
  .then((history) => console.log(history.length))
  .catch((error: unknown) => console.error(error));

// A teardown hook runs this.
stopListening();
calls.dispose();
provider.dispose();
