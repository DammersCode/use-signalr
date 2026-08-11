<script lang="ts">
  import { InvokeError } from "@dammers/use-signalr-svelte";
  import { BASE_URL, makeToken } from "@examples/contract";
  import {
    provideSignalR,
    onHubEvent,
    hubInvoke,
    hubSend,
    hubStatus,
    onReconnected,
  } from "./client.js";
  import Counter from "./Counter.svelte";

  const LOG = "[use-signalr:svelte]";

  provideSignalR({ baseUrl: BASE_URL, accessTokenFactory: makeToken("svelte") });

  let showCounter = $state(false);
  const chatStatus = hubStatus("/hubs/chat");

  const echo = hubInvoke("/hubs/chat", "Echo");
  const add = hubInvoke("/hubs/chat", "Add");
  const slowEcho = hubInvoke("/hubs/chat", "SlowEcho");
  const fail = hubInvoke("/hubs/chat", "Fail", { retries: 1 });
  const connectionId = hubInvoke("/hubs/chat", "ConnectionId");
  const ping = hubSend("/hubs/chat", "Ping");
  const leave = hubSend("/hubs/chat", "Leave");
  const killConnection = hubSend("/hubs/chat", "KillConnection");

  onHubEvent("/hubs/chat", "Tick", (count) => {
    console.log(`${LOG} tick ${count}`);
  });
  onHubEvent("/hubs/chat", "Echoed", (text, at) => {
    console.log(`${LOG} echoed ${text} at ${at}`);
  });
  onHubEvent("/hubs/chat", "Left", (id) => {
    console.log(`${LOG} left ${id}`);
  });
  onReconnected("/hubs/chat", () => {
    console.log(`${LOG} reconnected`);
  });

  $effect(() => {
    console.log(`${LOG} status /hubs/chat: ${$chatStatus}`);
  });

  async function onFail() {
    try {
      await fail();
    } catch (err) {
      if (err instanceof InvokeError) {
        console.log(`${LOG} invoke failed: attempts=${err.attempts} retriable=${err.retriable}`);
      } else {
        console.log(`${LOG} invoke failed: ${String(err)}`);
      }
    }
  }
</script>

<div>
  <h1>use-signalr: svelte</h1>
  <p>Open the web console (F12) — that is where the magic happens.</p>
  <p>status /hubs/chat: {$chatStatus}</p>
  <button onclick={() => echo("hello").then((r) => console.log(`${LOG} echo -> ${r}`))}>
    Echo
  </button>
  <button onclick={() => add(2, 3).then((r) => console.log(`${LOG} add -> ${r}`))}>
    Add(2,3)
  </button>
  <button
    onclick={() => slowEcho("slow", 2000).then((r) => console.log(`${LOG} slowEcho -> ${r}`))}
  >
    SlowEcho(2s)
  </button>
  <button onclick={onFail}>Fail</button>
  <button onclick={() => ping().then((ok) => console.log(`${LOG} ping sent: ${ok}`))}>
    Ping
  </button>
  <button onclick={() => leave().then((ok) => console.log(`${LOG} leave sent: ${ok}`))}>
    Leave
  </button>
  <button onclick={() => killConnection().then((ok) => console.log(`${LOG} kill sent: ${ok}`))}>
    Kill
  </button>
  <button onclick={() => connectionId().then((id) => console.log(`${LOG} connectionId -> ${id}`))}>
    ConnectionId
  </button>
  <button onclick={() => (showCounter = !showCounter)}>Toggle counter</button>
  {#if showCounter}
    <Counter />
  {/if}
</div>
