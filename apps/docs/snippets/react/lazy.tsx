import { useState } from "react";
import { useSignalREffect } from "./client";

export function OnlineCount() {
  const [count, setCount] = useState<number>();

  useSignalREffect("/hubs/presence", "OnlineCount", (online) => setCount(online));

  return <span>{count ?? "..."} online</span>;
}
