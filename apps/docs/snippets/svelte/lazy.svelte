<script lang="ts">
  import { onHubEvent } from "./client";

  let count = $state(0);

  // The subscription keeps the lazy hub connected while this component lives.
  onHubEvent("/hubs/presence", "OnlineCount", (online) => {
    count = online;
  });
</script>

<p>{count} online</p>
