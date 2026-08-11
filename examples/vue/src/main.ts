import { createApp } from "vue";
import { BASE_URL, makeToken } from "@examples/contract";
import { signalR } from "./client.js";
import App from "./App.vue";

createApp(App)
  .use(signalR, {
    baseUrl: BASE_URL,
    accessTokenFactory: makeToken("vue"),
  })
  .mount("#app");
