<script lang="ts">
  import { onDestroy } from "svelte";
  import { createLogger } from "@examples/contract";
  import { onHubEvent, hubTeardown, hubStatus } from "./client.js";

  const log = createLogger("svelte");

  const status = hubStatus("/hubs/counter");
  const leave = hubTeardown("/hubs/chat", "Leave");
  let count: number | null = $state(null);

  onHubEvent("/hubs/counter", "Count", (value) => {
    log.count(value);
    count = value;
  });

  $effect(() => {
    log.status("/hubs/counter", $status);
  });

  onDestroy(() => {
    void leave();
  });
</script>

<div>
  <p>counter hub status: {$status}</p>
  <p>count: {count ?? "(waiting)"}</p>
</div>
