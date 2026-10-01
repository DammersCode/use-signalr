<script setup lang="ts">
import { ref } from "vue";
import { useSignalREvent } from "./client";

const count = ref(0);

// The subscription keeps the lazy hub connected while this component lives.
useSignalREvent("/hubs/presence", "OnlineCount", (online) => {
  count.value = online;
});
</script>

<template>
  <p>{{ count }} online</p>
</template>
