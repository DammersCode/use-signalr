<script setup lang="ts">
import { ref } from "vue";
import { useSignalREvent } from "./client";
import type { ChatMessage } from "./contract";

const props = defineProps<{ roomId: string }>();
const messages = ref<ChatMessage[]>([]);

useSignalREvent("/hubs/rooms", "MessageReceived", (message) => {
  if (message.roomId === props.roomId) messages.value.push(message);
});
</script>

<template>
  <ul>
    <li v-for="(message, index) in messages" :key="index">{{ message.user }}: {{ message.text }}</li>
  </ul>
</template>
