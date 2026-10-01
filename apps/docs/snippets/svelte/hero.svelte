<script module lang="ts">
  import { createSignalRClient, method } from "@dammers/use-signalr-svelte";

  export const { provideSignalR, hubInvoke } = createSignalRClient({
    hubs: {
      "/hubs/rooms": {
        methods: { GetHistory: method<[roomId: string], { text: string }[]>() },
      },
    },
  });
</script>

<script lang="ts">
  provideSignalR({ baseUrl: "https://api.example.com", accessTokenFactory: () => "token" });

  const getHistory = hubInvoke("/hubs/rooms", "GetHistory");
  let count = $state(0);
  const load = () => getHistory("general").then((m) => (count = m.length)).catch(console.error);
</script>

<button onclick={load}>{count} messages</button>
