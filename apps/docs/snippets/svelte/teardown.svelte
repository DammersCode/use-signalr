<script lang="ts">
  import { onDestroy } from "svelte";
  import { hubTeardown } from "./client";

  let { roomId }: { roomId: string } = $props();
  const leaveRoom = hubTeardown("/hubs/rooms", "LeaveRoom");

  onDestroy(() => {
    void leaveRoom(roomId);
  });
</script>
