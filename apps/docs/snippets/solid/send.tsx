import { createSignal, Show } from "solid-js";
import { useSignalRSend } from "./client";

export function Composer(props: { roomId: string }) {
  const send = useSignalRSend("/hubs/rooms", "SendMessage");
  const [text, setText] = createSignal("");
  const [notice, setNotice] = createSignal("");

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const sent = await send(props.roomId, text());
    if (sent) setText("");
    else setNotice("Not connected. The message was not sent.");
  }

  return (
    <form onSubmit={submit}>
      <input value={text()} onInput={(e) => setText(e.currentTarget.value)} />
      <button>Send</button>
      <Show when={notice()}>
        <p role="status">{notice()}</p>
      </Show>
    </form>
  );
}
