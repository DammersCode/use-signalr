<script lang="ts">
  import { onMount } from "svelte";
  import { hubInvoke } from "./client";
  import type { ChatMessage } from "./contract";

  let { roomId }: { roomId: string } = $props();
  let history = $state<ChatMessage[]>([]);
  let error = $state<string>();
  const getHistory = hubInvoke("/hubs/rooms", "GetHistory");

  async function load() {
    try {
      history = await getHistory(roomId);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      error = e instanceof Error ? e.message : String(e);
    }
  }

  onMount(load);
</script>

{#if error}
  <p role="alert">{error}</p>
{:else}
  <ul>
    {#each history as message}
      <li>{message.text}</li>
    {/each}
  </ul>
{/if}
