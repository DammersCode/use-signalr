<script setup lang="ts">
import { computed } from "vue";
import type { HubConnectionStatus } from "@dammers/use-signalr-vue";
import { useHubStatus } from "./client";

const labels: Record<HubConnectionStatus, string> = {
  idle: "",
  connecting: "Connecting...",
  connected: "",
  reconnecting: "Connection lost. Reconnecting...",
  disconnected: "Disconnected. Sign in again.",
};

const status = useHubStatus("/hubs/rooms");
const label = computed(() => labels[status.value]);
</script>

<template>
  <p v-if="label" role="status">{{ label }}</p>
</template>
