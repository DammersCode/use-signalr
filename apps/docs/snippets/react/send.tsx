import { useState } from "react";
import { useSignalRSend } from "./client";

export function Composer({ roomId }: { roomId: string }) {
  const send = useSignalRSend("/hubs/rooms", "SendMessage");
  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");

  async function submit() {
    const sent = await send(roomId, text);
    if (sent) setText("");
    else setNotice("Not connected. The message was not sent.");
  }

  return (
    <form action={submit}>
      <input value={text} onChange={(e) => setText(e.target.value)} />
      <button>Send</button>
      {notice && <p role="status">{notice}</p>}
    </form>
  );
}
