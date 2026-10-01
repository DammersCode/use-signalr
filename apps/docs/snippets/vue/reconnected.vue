<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useOnReconnected, useSignalRInvoke } from "./client";
import { ignoreAbort } from "./ignore-abort";
import type { ChatMessage } from "./contract";

const props = defineProps<{ roomId: string }>();
const history = ref<ChatMessage[]>([]);
const getHistory = useSignalRInvoke("/hubs/rooms", "GetHistory");

async function load() {
  try {
    history.value = await getHistory(props.roomId);
  } catch (e) {
    ignoreAbort(e);
  }
}

onMounted(load);
useOnReconnected("/hubs/rooms", load);
</script>

<template>
  <ul>
    <li v-for="(message, index) in history" :key="index">{{ message.text }}</li>
  </ul>
</template>
