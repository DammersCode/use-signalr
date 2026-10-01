<script lang="ts">
  import { onMount } from "svelte";
  import { hubInvoke, onReconnected } from "./client";
  import { ignoreAbort } from "./ignore-abort";
  import type { ChatMessage } from "./contract";

  let { roomId }: { roomId: string } = $props();
  let history = $state<ChatMessage[]>([]);
  const getHistory = hubInvoke("/hubs/rooms", "GetHistory");

  async function load() {
    try {
      history = await getHistory(roomId);
    } catch (e) {
      ignoreAbort(e);
    }
  }

  onMount(load);
  onReconnected("/hubs/rooms", load);
</script>

<ul>
  {#each history as message}
    <li>{message.text}</li>
  {/each}
</ul>
