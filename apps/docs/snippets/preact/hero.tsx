import { useState } from "preact/hooks";
import { createSignalRClient, method } from "@dammers/use-signalr-preact";

const { SignalRProvider, useSignalRInvoke } = createSignalRClient({
  hubs: {
    "/hubs/rooms": {
      methods: { GetHistory: method<[roomId: string], { text: string }[]>() },
    },
  },
});

function HistoryCount({ roomId }: { roomId: string }) {
  const getHistory = useSignalRInvoke("/hubs/rooms", "GetHistory");
  const [count, setCount] = useState(0);
  const load = () => getHistory(roomId).then((m) => setCount(m.length)).catch(console.error);
  return <button onClick={load}>{count} messages</button>;
}

export function App() {
  return (
    <SignalRProvider baseUrl="https://api.example.com" accessTokenFactory={() => "token"}>
      <HistoryCount roomId="general" />
    </SignalRProvider>
  );
}
