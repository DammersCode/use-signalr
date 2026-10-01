import { createSignal } from "solid-js";
import { useSignalREffect } from "./client";

export function OnlineCount() {
  const [count, setCount] = createSignal<number>();

  useSignalREffect("/hubs/presence", "OnlineCount", (n) => setCount(n));

  return <span>{count() ?? "..."} online</span>;
}
