<script setup lang="ts">
import { ref } from "vue";
import { useSignalRSend } from "./client";

const props = defineProps<{ roomId: string }>();
const text = ref("");
const dropped = ref(false);
const send = useSignalRSend("/hubs/rooms", "SendMessage");

async function submit() {
  const sent = await send(props.roomId, text.value);
  dropped.value = !sent;
  if (sent) text.value = "";
}
</script>

<template>
  <form @submit.prevent="submit">
    <input v-model="text" />
    <button>Send</button>
    <span v-if="dropped" role="alert">Not connected. The message was dropped.</span>
  </form>
</template>
