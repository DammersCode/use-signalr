<script lang="ts">
  // Runs an arbitrary init-time callback inside a real component instance, so
  // hooks that rely on getContext/onDestroy during component init work. The
  // fake context is injected via mount's `context` option, not a provider.
  interface Props {
    run: () => void;
  }
  const { run }: Props = $props();
  run();
</script>
