<script setup lang="ts">
import { ref, watch } from "vue";
import { useHubStatus, useSignalREvent, useSignalRInvoke } from "./client";
import { ignoreAbort } from "./ignore-abort";
import type { ChatMessage } from "./contract";

const props = defineProps<{ roomId: string }>();
const messages = ref<ChatMessage[]>([]);
const text = ref("");
const status = useHubStatus("/hubs/rooms");
const joinRoom = useSignalRInvoke("/hubs/rooms", "JoinRoom");
const sendMessage = useSignalRInvoke("/hubs/rooms", "SendMessage");

watch(
  [status, () => props.roomId],
  ([current, roomId]) => {
    if (current === "connected") joinRoom(roomId).catch(ignoreAbort);
  },
  { immediate: true },
);

useSignalREvent("/hubs/rooms", "MessageReceived", (message) => {
  if (message.roomId === props.roomId) messages.value.push(message);
});

async function submit() {
  try {
    await sendMessage(props.roomId, text.value);
    text.value = "";
  } catch (e) {
    ignoreAbort(e);
  }
}
</script>

<template>
  <ul>
    <li v-for="(message, index) in messages" :key="index">{{ message.user }}: {{ message.text }}</li>
  </ul>
  <form @submit.prevent="submit">
    <input v-model="text" />
    <button :disabled="status !== 'connected'">Send</button>
  </form>
</template>
