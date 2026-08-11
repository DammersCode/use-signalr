import { useEffect, useState } from "react";
import {
  useSignalREffect,
  useSignalRTeardown,
  useHubStatus,
} from "./client.js";

const LOG = "[use-signalr:react]";

/** Mounted/unmounted via "Toggle counter" to exercise lazy connect + grace-period disconnect. */
export function Counter() {
  const [count, setCount] = useState<number | null>(null);
  const status = useHubStatus("/hubs/counter");
  const leave = useSignalRTeardown("/hubs/chat", "Leave");

  useSignalREffect("/hubs/counter", "Count", (value) => {
    console.log(`${LOG} count ${value}`);
    setCount(value);
  });

  useEffect(() => {
    console.log(`${LOG} status /hubs/counter: ${status}`);
  }, [status]);

  useEffect(() => {
    return () => {
      void leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <p>counter hub status: {status}</p>
      <p>count: {count ?? "(waiting)"}</p>
    </div>
  );
}
