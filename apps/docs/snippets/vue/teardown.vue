<script setup lang="ts">
import { onUnmounted } from "vue";
import { useSignalRTeardown } from "./client";

const props = defineProps<{ roomId: string }>();
const leaveRoom = useSignalRTeardown("/hubs/rooms", "LeaveRoom");

onUnmounted(() => {
  void leaveRoom(props.roomId);
});
</script>

<template>
  <slot />
</template>
