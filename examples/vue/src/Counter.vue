<script setup lang="ts">
import { onScopeDispose, ref, watch } from "vue";
import { createLogger } from "@examples/contract";
import { useSignalREvent, useSignalRTeardown, useHubStatus } from "./client.js";

const log = createLogger("vue");

const status = useHubStatus("/hubs/counter");
const leave = useSignalRTeardown("/hubs/chat", "Leave");
const count = ref<number | null>(null);

useSignalREvent("/hubs/counter", "Count", (value) => {
  log.count(value);
  count.value = value;
});

watch(status, (value) => {
  log.status("/hubs/counter", value);
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
