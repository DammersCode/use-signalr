<script lang="ts">
  import { hubInvoke, hubStatus, hubTeardown } from "./client";
  import { ignoreAbort } from "./ignore-abort";

  let { roomId }: { roomId: string } = $props();
  const status = hubStatus("/hubs/rooms");
  const joinRoom = hubInvoke("/hubs/rooms", "JoinRoom");
  const leaveRoom = hubTeardown("/hubs/rooms", "LeaveRoom");

  $effect(() => {
    if ($status === "connected") joinRoom(roomId).catch(ignoreAbort);
  });

  $effect(() => {
    const id = roomId;
    return () => void leaveRoom(id);
  });
</script>
