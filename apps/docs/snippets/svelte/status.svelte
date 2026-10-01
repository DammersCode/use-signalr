<script lang="ts">
  import type { HubConnectionStatus } from "@dammers/use-signalr-svelte";
  import { hubStatus } from "./client";

  const labels: Record<HubConnectionStatus, string> = {
    idle: "",
    connecting: "Connecting...",
    connected: "",
    reconnecting: "Connection lost. Reconnecting...",
    disconnected: "Disconnected. Sign in again.",
  };

  const status = hubStatus("/hubs/rooms");
  const label = $derived(labels[$status]);
</script>

{#if label}
  <p role="status">{label}</p>
{/if}
