<script lang="ts">
  import type { Snippet } from "svelte";
  import { toStore } from "svelte/store";
  import { provideSignalR } from "./client";

  let { token, children }: { token: string | undefined; children: Snippet } = $props();

  provideSignalR({
    baseUrl: "https://api.example.com",
    accessTokenFactory: () => token ?? "",
    enabled: toStore(() => token !== undefined),
  });
</script>

{@render children()}
