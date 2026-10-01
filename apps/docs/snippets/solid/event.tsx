import { createSignal, For } from "solid-js";
import type { ChatMessage } from "./contract";
import { useSignalREffect } from "./client";

export function Messages(props: { roomId: string }) {
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);

  useSignalREffect("/hubs/rooms", "MessageReceived", (message) => {
    if (message.roomId === props.roomId) setMessages((all) => [...all, message]);
  });

  return (
    <ul>
      <For each={messages()}>{(m) => <li>{m.user}: {m.text}</li>}</For>
    </ul>
  );
}
