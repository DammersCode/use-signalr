<script lang="ts">
  import type { Readable } from "svelte/store";
  import type { SignalRProviderProps } from "../../types.js";

  interface Props {
    provide: (props: SignalRProviderProps) => void;
    providerProps: SignalRProviderProps;
    statusOf: () => Readable<string>;
  }
  const { provide, providerProps, statusOf }: Props = $props();
  provide(providerProps);
  const status = statusOf();
</script>

<p>{$status}</p>
