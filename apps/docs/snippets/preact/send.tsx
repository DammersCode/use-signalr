import { useState } from "preact/hooks";
import { useSignalRSend } from "./client";

export function Composer({ roomId }: { roomId: string }) {
  const send = useSignalRSend("/hubs/rooms", "SendMessage");
  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(event: Event) {
    event.preventDefault();
    const sent = await send(roomId, text);
    if (sent) setText("");
    else setNotice("Not connected. The message was not sent.");
  }

  return (
    <form onSubmit={submit}>
      <input value={text} onInput={(e) => setText(e.currentTarget.value)} />
      <button>Send</button>
      {notice && <p role="status">{notice}</p>}
    </form>
  );
}
