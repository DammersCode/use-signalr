<script lang="ts">
  import { onDestroy } from "svelte";
  import { onHubEvent, hubTeardown, hubStatus } from "./client.js";

  const LOG = "[use-signalr:svelte]";

  const status = hubStatus("/hubs/counter");
  const leave = hubTeardown("/hubs/chat", "Leave");
  let count: number | null = $state(null);

  onHubEvent("/hubs/counter", "Count", (value) => {
    console.log(`${LOG} count ${value}`);
    count = value;
  });

  $effect(() => {
    console.log(`${LOG} status /hubs/counter: ${$status}`);
  });

  onDestroy(() => {
    void leave();
  });
</script>

<div>
  <p>counter hub status: {$status}</p>
  <p>count: {count ?? "(waiting)"}</p>
</div>
