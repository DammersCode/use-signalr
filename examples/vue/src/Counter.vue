<script setup lang="ts">
import { onScopeDispose, ref, watch } from "vue";
import { useSignalREvent, useSignalRTeardown, useHubStatus } from "./client.js";

const LOG = "[use-signalr:vue]";

const status = useHubStatus("/hubs/counter");
const leave = useSignalRTeardown("/hubs/chat", "Leave");
const count = ref<number | null>(null);

useSignalREvent("/hubs/counter", "Count", (value) => {
  console.log(`${LOG} count ${value}`);
  count.value = value;
});

watch(status, (value) => {
  console.log(`${LOG} status /hubs/counter: ${value}`);
});

onScopeDispose(() => {
  void leave();
});
</script>

<template>
  <div>
    <p>counter hub status: {{ status }}</p>
    <p>count: {{ count ?? "(waiting)" }}</p>
  </div>
</template>
