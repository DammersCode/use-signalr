<script lang="ts">
  import { onHubEvent } from "./client";
  import type { ChatMessage } from "./contract";

  let { roomId }: { roomId: string } = $props();
  let messages = $state<ChatMessage[]>([]);

  onHubEvent("/hubs/rooms", "MessageReceived", (message) => {
    if (message.roomId === roomId) messages.push(message);
  });
</script>

<ul>
  {#each messages as message}
    <li>{message.user}: {message.text}</li>
  {/each}
</ul>
