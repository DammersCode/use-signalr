import { useEffect, useState } from "preact/hooks";
import type { ChatMessage } from "./contract";
import { useHubStatus, useSignalREffect, useSignalRInvoke } from "./client";
import { ignoreAbort } from "./ignore-abort";

export function Room({ roomId }: { roomId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const status = useHubStatus("/hubs/rooms");
  const joinRoom = useSignalRInvoke("/hubs/rooms", "JoinRoom");
  const sendMessage = useSignalRInvoke("/hubs/rooms", "SendMessage");

  useEffect(() => {
    if (status === "connected") joinRoom(roomId).catch(ignoreAbort);
  }, [status, roomId, joinRoom]);

  useSignalREffect("/hubs/rooms", "MessageReceived", (message) => {
    if (message.roomId === roomId) setMessages((all) => [...all, message]);
  });

  return (
    <div>
      <ul>
        {messages.map((m, index) => (
          <li key={index}>{m.user}: {m.text}</li>
        ))}
      </ul>
      <button
        disabled={status !== "connected"}
        onClick={() => sendMessage(roomId, "Hello").catch(ignoreAbort)}
      >
        Say hello
      </button>
    </div>
  );
}
