import { createApp, ref } from "vue";
import App from "./App.vue";
import { signalR } from "./client";

const token = ref("");
const userId = ref<string>();
const loginCount = ref(0);

createApp(App)
  .use(signalR, {
    baseUrl: "https://api.example.com",
    accessTokenFactory: () => token.value,
    enabled: () => userId.value !== undefined,
    connectionKey: () => `${userId.value}:${loginCount.value}`,
  })
  .mount("#app");

export function onLogin(id: string, newToken: string) {
  token.value = newToken;
  userId.value = id;
  loginCount.value += 1;
}
