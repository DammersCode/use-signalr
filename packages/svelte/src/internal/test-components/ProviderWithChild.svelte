<script lang="ts">
  import { readable } from "svelte/store";
  import type { Readable } from "svelte/store";
  import type { SignalRProviderProps } from "../../types.js";
  import Runner from "./Runner.svelte";

  interface Props {
    provide: (props: SignalRProviderProps) => void;
    providerProps: SignalRProviderProps;
    run: () => void;
    show?: Readable<boolean>;
  }
  const { provide, providerProps, run, show = readable(true) }: Props = $props();
  provide(providerProps);
</script>

{#if $show}
  <Runner {run} />
{/if}
