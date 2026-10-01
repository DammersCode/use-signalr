<script module lang="ts">
  import { writable, get } from "svelte/store";
  import { createSignalRClient } from "@dammers/use-signalr-svelte";
  import { JsonHubProtocol } from "@microsoft/signalr";
  import { MessagePackHubProtocol } from "@microsoft/signalr-protocol-msgpack";
  import { hubs } from "./contract";

  const useBinary = writable(true);

  const { provideSignalR } = createSignalRClient({
    hubs,
    hubProtocol: () => (get(useBinary) ? new MessagePackHubProtocol() : new JsonHubProtocol()),
  });
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { derived } from "svelte/store";

  let { children }: { children: Snippet } = $props();

  provideSignalR({
    baseUrl: "https://api.example.com",
    accessTokenFactory: () => localStorage.getItem("token") ?? "",
    connectionKey: derived(useBinary, String),
  });
</script>

<button onclick={() => useBinary.update((binary) => !binary)}>Switch protocol</button>
{@render children()}
