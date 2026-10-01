import { createSignal } from "solid-js";
import { createSignalRClient, method } from "@dammers/use-signalr-solid";

const { SignalRProvider, useSignalRInvoke } = createSignalRClient({
  hubs: {
    "/hubs/rooms": {
      methods: { GetHistory: method<[roomId: string], { text: string }[]>() },
    },
  },
});

function HistoryCount(props: { roomId: string }) {
  const getHistory = useSignalRInvoke("/hubs/rooms", "GetHistory");
  const [count, setCount] = createSignal(0);
  const load = () => getHistory(props.roomId).then((m) => setCount(m.length)).catch(console.error);
  return <button onClick={load}>{count()} messages</button>;
}

export function App() {
  return (
    <SignalRProvider baseUrl="https://api.example.com" accessTokenFactory={() => "token"}>
      <HistoryCount roomId="general" />
    </SignalRProvider>
  );
}
