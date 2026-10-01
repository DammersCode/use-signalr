import { createEffect, createSignal, For } from "solid-js";
import type { ChatMessage } from "./contract";
import { useHubStatus, useSignalREffect, useSignalRInvoke } from "./client";
import { ignoreAbort } from "./ignore-abort";

export function Room(props: { roomId: string }) {
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const status = useHubStatus("/hubs/rooms");
  const joinRoom = useSignalRInvoke("/hubs/rooms", "JoinRoom");
  const sendMessage = useSignalRInvoke("/hubs/rooms", "SendMessage");

  createEffect(() => {
    if (status() === "connected") joinRoom(props.roomId).catch(ignoreAbort);
  });

  useSignalREffect("/hubs/rooms", "MessageReceived", (message) => {
    if (message.roomId === props.roomId) setMessages((all) => [...all, message]);
  });

  return (
    <div>
      <ul>
        <For each={messages()}>{(m) => <li>{m.user}: {m.text}</li>}</For>
      </ul>
      <button
        disabled={status() !== "connected"}
        onClick={() => sendMessage(props.roomId, "Hello").catch(ignoreAbort)}
      >
        Say hello
      </button>
    </div>
  );
}
