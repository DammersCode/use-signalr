<script lang="ts">
  import { hubInvoke, hubStatus, onHubEvent } from "./client";
  import { ignoreAbort } from "./ignore-abort";
  import type { ChatMessage } from "./contract";

  let { roomId }: { roomId: string } = $props();
  let messages = $state<ChatMessage[]>([]);
  let text = $state("");
  const status = hubStatus("/hubs/rooms");
  const joinRoom = hubInvoke("/hubs/rooms", "JoinRoom");
  const sendMessage = hubInvoke("/hubs/rooms", "SendMessage");

  $effect(() => {
    if ($status === "connected") joinRoom(roomId).catch(ignoreAbort);
  });

  onHubEvent("/hubs/rooms", "MessageReceived", (message) => {
    if (message.roomId === roomId) messages.push(message);
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    try {
      await sendMessage(roomId, text);
      text = "";
    } catch (e) {
      ignoreAbort(e);
    }
  }
</script>

<ul>
  {#each messages as message}
    <li>{message.user}: {message.text}</li>
  {/each}
</ul>
<form onsubmit={submit}>
  <input bind:value={text} />
  <button disabled={$status !== "connected"}>Send</button>
</form>
