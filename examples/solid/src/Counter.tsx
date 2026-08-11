import { createSignal, onCleanup, createEffect } from "solid-js";
import { createLogger } from "@examples/contract";
import { useSignalREffect, useSignalRTeardown, useHubStatus } from "./client.js";

const log = createLogger("solid");

/** Mounted/unmounted via "Toggle counter" to exercise lazy connect + grace-period disconnect. */
export function Counter() {
  const [count, setCount] = createSignal<number | null>(null);
  const status = useHubStatus("/hubs/counter");
  const leave = useSignalRTeardown("/hubs/chat", "Leave");

  useSignalREffect("/hubs/counter", "Count", (value) => {
    log.count(value);
    setCount(value);
  });

  createEffect(() => {
    log.status("/hubs/counter", status());
  });

  onCleanup(() => {
    void leave();
  });

  return (
    <div>
      <p>counter hub status: {status()}</p>
      <p>count: {count() ?? "(waiting)"}</p>
    </div>
  );
}
