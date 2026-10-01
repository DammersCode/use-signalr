<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useSignalRInvoke } from "./client";
import type { ChatMessage } from "./contract";

const props = defineProps<{ roomId: string }>();
const history = ref<ChatMessage[]>([]);
const error = ref<string>();
const getHistory = useSignalRInvoke("/hubs/rooms", "GetHistory");

async function load() {
  try {
    history.value = await getHistory(props.roomId);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return;
    error.value = e instanceof Error ? e.message : String(e);
  }
}

onMounted(load);
</script>

<template>
  <p v-if="error" role="alert">{{ error }}</p>
  <ul v-else>
    <li v-for="(message, index) in history" :key="index">{{ message.text }}</li>
  </ul>
</template>
