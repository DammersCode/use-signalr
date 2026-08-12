import { useEffect, useState } from "react";
import { createLogger } from "@examples/contract";
import {
  useSignalREffect,
  useSignalRTeardown,
  useHubStatus,
} from "./client.js";

const log = createLogger("react");

/** Mounted/unmounted via "Toggle counter" to exercise lazy connect + grace-period disconnect. */
export function Counter() {
  const [count, setCount] = useState<number | null>(null);
  const status = useHubStatus("/hubs/counter");
  const leave = useSignalRTeardown("/hubs/chat", "Leave");

  useSignalREffect("/hubs/counter", "Count", (value) => {
    log.count(value);
    setCount(value);
  });

  useEffect(() => {
    log.status("/hubs/counter", status);
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
