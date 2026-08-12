<script lang="ts">
  import type { SignalRProviderProps } from "../../types.js";

  // setContext/getContext share one Map per component instance, so calling
  // `provide` (setContext) then `run` (getContext-based hooks) in the same
  // component init works — no separate child component is needed.
  interface Props {
    provide: (props: SignalRProviderProps) => void;
    providerProps: SignalRProviderProps;
    run?: () => void;
  }
  const { provide, providerProps, run }: Props = $props();
  provide(providerProps);
  run?.();
</script>
