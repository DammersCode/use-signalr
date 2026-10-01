import { createApp, ref } from "vue";
import { createSignalRClient, method } from "@dammers/use-signalr-vue";
import App from "./App.vue";

export const signalR = createSignalRClient({
  hubs: {
    "/hubs/rooms": {
      methods: { GetHistory: method<[roomId: string], { text: string }[]>() },
    },
  },
});

createApp(App)
  .use(signalR, { baseUrl: "https://api.example.com", accessTokenFactory: () => "token" })
  .mount("#app");

// Call this composable in a component's setup().
export function useHistoryCount(roomId: string) {
  const getHistory = signalR.useSignalRInvoke("/hubs/rooms", "GetHistory");
  const count = ref(0);
  const load = () => getHistory(roomId).then((m) => (count.value = m.length)).catch(console.error);
  return { count, load };
}
