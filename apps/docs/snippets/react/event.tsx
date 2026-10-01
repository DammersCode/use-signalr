import { useState } from "react";
import type { ChatMessage } from "./contract";
import { useSignalREffect } from "./client";

export function Messages({ roomId }: { roomId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useSignalREffect("/hubs/rooms", "MessageReceived", (message) => {
    if (message.roomId === roomId) setMessages((all) => [...all, message]);
  });

  return (
    <ul>
      {messages.map((m, index) => (
        <li key={index}>{m.user}: {m.text}</li>
      ))}
    </ul>
  );
}
