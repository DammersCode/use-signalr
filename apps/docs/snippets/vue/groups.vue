<script setup lang="ts">
import { onUnmounted, watch } from "vue";
import { useHubStatus, useSignalRInvoke, useSignalRTeardown } from "./client";
import { ignoreAbort } from "./ignore-abort";

const props = defineProps<{ roomId: string }>();
const status = useHubStatus("/hubs/rooms");
const joinRoom = useSignalRInvoke("/hubs/rooms", "JoinRoom");
const leaveRoom = useSignalRTeardown("/hubs/rooms", "LeaveRoom");

watch(
  [status, () => props.roomId],
  ([current, roomId]) => {
    if (current === "connected") joinRoom(roomId).catch(ignoreAbort);
  },
  { immediate: true },
);

watch(
  () => props.roomId,
  (_next, previous) => void leaveRoom(previous),
);

onUnmounted(() => void leaveRoom(props.roomId));
</script>

<template>
  <slot />
</template>
