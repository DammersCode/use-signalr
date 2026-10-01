<script lang="ts">
  import { hubSend } from "./client";

  let { roomId }: { roomId: string } = $props();
  let text = $state("");
  let dropped = $state(false);
  const send = hubSend("/hubs/rooms", "SendMessage");

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const sent = await send(roomId, text);
    dropped = !sent;
    if (sent) text = "";
  }
</script>

<form onsubmit={submit}>
  <input bind:value={text} />
  <button>Send</button>
  {#if dropped}
    <span role="alert">Not connected. The message was dropped.</span>
  {/if}
</form>
