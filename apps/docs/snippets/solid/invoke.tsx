import { createEffect, createSignal, Show } from "solid-js";
import type { ChatMessage } from "./contract";
import { useSignalRInvoke } from "./client";

export function History(props: { roomId: string }) {
  const getHistory = useSignalRInvoke("/hubs/rooms", "GetHistory");
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [error, setError] = createSignal<string>();

  createEffect(() => {
    const roomId = props.roomId;
    getHistory(roomId)
      .then((history) => {
        if (roomId === props.roomId) setMessages(history);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : String(e));
      });
  });

  return (
    <Show when={!error()} fallback={<p role="alert">{error()}</p>}>
      <p>{messages().length} messages</p>
    </Show>
  );
}
