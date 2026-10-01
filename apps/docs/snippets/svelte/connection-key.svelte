<script lang="ts">
  import type { Snippet } from "svelte";
  import { toStore } from "svelte/store";
  import { provideSignalR } from "./client";

  type Props = { userId: string | undefined; loginCount: number; token: string; children: Snippet };
  let { userId, loginCount, token, children }: Props = $props();

  provideSignalR({
    baseUrl: "https://api.example.com",
    accessTokenFactory: () => token,
    enabled: toStore(() => userId !== undefined),
    connectionKey: toStore(() => `${userId}:${loginCount}`),
  });
</script>

{@render children()}
