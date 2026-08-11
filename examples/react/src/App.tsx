import { useEffect, useState } from "react";
import { InvokeError } from "@dammers/use-signalr-react";
import { BASE_URL, makeToken } from "@examples/contract";
import {
  SignalRProvider,
  useSignalREffect,
  useSignalRInvoke,
  useSignalRSend,
  useHubStatus,
  useOnReconnected,
} from "./client.js";
import { Counter } from "./Counter.js";

const LOG = "[use-signalr:react]";

function Main() {
  const [showCounter, setShowCounter] = useState(false);
  const chatStatus = useHubStatus("/hubs/chat");

  const echo = useSignalRInvoke("/hubs/chat", "Echo");
  const add = useSignalRInvoke("/hubs/chat", "Add");
  const slowEcho = useSignalRInvoke("/hubs/chat", "SlowEcho");
  const fail = useSignalRInvoke("/hubs/chat", "Fail", { retries: 1 });
  const connectionId = useSignalRInvoke("/hubs/chat", "ConnectionId");
  const ping = useSignalRSend("/hubs/chat", "Ping");
  const leave = useSignalRSend("/hubs/chat", "Leave");
  const killConnection = useSignalRSend("/hubs/chat", "KillConnection");

  useSignalREffect("/hubs/chat", "Tick", (count) => {
    console.log(`${LOG} tick ${count}`);
  });
  useSignalREffect("/hubs/chat", "Echoed", (text, at) => {
    console.log(`${LOG} echoed ${text} at ${at}`);
  });
  useSignalREffect("/hubs/chat", "Left", (id) => {
    console.log(`${LOG} left ${id}`);
  });
  useOnReconnected("/hubs/chat", () => {
    console.log(`${LOG} reconnected`);
  });

  useEffect(() => {
    console.log(`${LOG} status /hubs/chat: ${chatStatus}`);
  }, [chatStatus]);

  async function onFail() {
    try {
      await fail();
    } catch (err) {
      if (err instanceof InvokeError) {
        console.log(
          `${LOG} invoke failed: attempts=${err.attempts} retriable=${err.retriable}`,
        );
      } else {
        console.log(`${LOG} invoke failed: ${String(err)}`);
      }
    }
  }

  return (
    <div>
      <h1>use-signalr: react</h1>
      <p>Open the web console (F12) — that is where the magic happens.</p>
      <p>status /hubs/chat: {chatStatus}</p>
      <button onClick={() => echo("hello").then((r) => console.log(`${LOG} echo -> ${r}`))}>
        Echo
      </button>
      <button onClick={() => add(2, 3).then((r) => console.log(`${LOG} add -> ${r}`))}>
        Add(2,3)
      </button>
      <button
        onClick={() =>
          slowEcho("slow", 2000).then((r) => console.log(`${LOG} slowEcho -> ${r}`))
        }
      >
        SlowEcho(2s)
      </button>
      <button onClick={onFail}>Fail</button>
      <button onClick={() => ping().then((ok) => console.log(`${LOG} ping sent: ${ok}`))}>
        Ping
      </button>
      <button onClick={() => leave().then((ok) => console.log(`${LOG} leave sent: ${ok}`))}>
        Leave
      </button>
      <button
        onClick={() =>
          killConnection().then((ok) => console.log(`${LOG} kill sent: ${ok}`))
        }
      >
        Kill
      </button>
      <button
        onClick={() =>
          connectionId().then((id) => console.log(`${LOG} connectionId -> ${id}`))
        }
      >
        ConnectionId
      </button>
      <button onClick={() => setShowCounter((v) => !v)}>Toggle counter</button>
      {showCounter && <Counter />}
    </div>
  );
}

export function App() {
  return (
    <SignalRProvider baseUrl={BASE_URL} accessTokenFactory={makeToken("react")}>
      <Main />
    </SignalRProvider>
  );
}
