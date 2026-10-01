import { useCallback, useEffect, useState } from "react";
import type { ChatMessage } from "./contract";
import { useOnReconnected, useSignalRInvoke } from "./client";
import { ignoreAbort } from "./ignore-abort";

export function History({ roomId }: { roomId: string }) {
  const getHistory = useSignalRInvoke("/hubs/rooms", "GetHistory");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const load = useCallback(() => {
    getHistory(roomId)
      .then(setMessages)
      .catch(ignoreAbort);
  }, [roomId, getHistory]);

  useEffect(load, [load]);
  useOnReconnected("/hubs/rooms", load);

  return <p>{messages.length} messages</p>;
}
