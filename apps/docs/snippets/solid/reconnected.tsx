import { createEffect, createSignal } from "solid-js";
import type { ChatMessage } from "./contract";
import { useOnReconnected, useSignalRInvoke } from "./client";
import { ignoreAbort } from "./ignore-abort";

export function History(props: { roomId: string }) {
  const getHistory = useSignalRInvoke("/hubs/rooms", "GetHistory");
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);

  const load = () => {
    getHistory(props.roomId)
      .then(setMessages)
      .catch(ignoreAbort);
  };

  createEffect(load);
  useOnReconnected("/hubs/rooms", load);

  return <p>{messages().length} messages</p>;
}
