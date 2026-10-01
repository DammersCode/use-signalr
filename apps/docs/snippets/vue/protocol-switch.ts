import { createApp, ref } from "vue";
import { createSignalRClient } from "@dammers/use-signalr-vue";
import { JsonHubProtocol } from "@microsoft/signalr";
import { MessagePackHubProtocol } from "@microsoft/signalr-protocol-msgpack";
import App from "./App.vue";
import { hubs } from "./contract";

export const useBinary = ref(true);

const signalR = createSignalRClient({
  hubs,
  hubProtocol: () => (useBinary.value ? new MessagePackHubProtocol() : new JsonHubProtocol()),
});

createApp(App)
  .use(signalR, {
    baseUrl: "https://api.example.com",
    accessTokenFactory: () => localStorage.getItem("token") ?? "",
    connectionKey: () => String(useBinary.value),
  })
  .mount("#app");
