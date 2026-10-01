import { useEffect, useState } from "preact/hooks";
import type { ChatMessage } from "./contract";
import { useSignalRInvoke } from "./client";

export function History({ roomId }: { roomId: string }) {
  const getHistory = useSignalRInvoke("/hubs/rooms", "GetHistory");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let stale = false;
    getHistory(roomId)
      .then((history) => {
        if (!stale) setMessages(history);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (!stale) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      stale = true;
    };
  }, [roomId, getHistory]);

  if (error) return <p role="alert">{error}</p>;
  return <p>{messages.length} messages</p>;
}
