import { createApp, ref } from "vue";
import App from "./App.vue";
import { signalR } from "./client";

const token = ref("");

createApp(App)
  .use(signalR, {
    baseUrl: "https://api.example.com",
    accessTokenFactory: () => token.value,
    enabled: () => token.value !== "",
  })
  .mount("#app");
