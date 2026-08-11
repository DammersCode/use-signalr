<script setup lang="ts">
import { ref, watch } from "vue";
import { InvokeError } from "@dammers/use-signalr-vue";
import {
  useSignalREvent,
  useSignalRInvoke,
  useSignalRSend,
  useHubStatus,
  useOnReconnected,
} from "./client.js";
import Counter from "./Counter.vue";

const LOG = "[use-signalr:vue]";

const chatStatus = useHubStatus("/hubs/chat");
const showCounter = ref(false);

const echo = useSignalRInvoke("/hubs/chat", "Echo");
const add = useSignalRInvoke("/hubs/chat", "Add");
const slowEcho = useSignalRInvoke("/hubs/chat", "SlowEcho");
const fail = useSignalRInvoke("/hubs/chat", "Fail", { retries: 1 });
const connectionId = useSignalRInvoke("/hubs/chat", "ConnectionId");
const ping = useSignalRSend("/hubs/chat", "Ping");
const leave = useSignalRSend("/hubs/chat", "Leave");
const killConnection = useSignalRSend("/hubs/chat", "KillConnection");

useSignalREvent("/hubs/chat", "Tick", (count) => {
  console.log(`${LOG} tick ${count}`);
});
useSignalREvent("/hubs/chat", "Echoed", (text, at) => {
  console.log(`${LOG} echoed ${text} at ${at}`);
});
useSignalREvent("/hubs/chat", "Left", (id) => {
  console.log(`${LOG} left ${id}`);
});
useOnReconnected("/hubs/chat", () => {
  console.log(`${LOG} reconnected`);
});

watch(chatStatus, (status) => {
  console.log(`${LOG} status /hubs/chat: ${status}`);
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

<template>
  <div>
    <h1>use-signalr: vue</h1>
    <p>Open the web console (F12) — that is where the magic happens.</p>
    <p>status /hubs/chat: {{ chatStatus }}</p>
    <button @click="echo('hello').then((r) => console.log(`${LOG} echo -> ${r}`))">Echo</button>
    <button @click="add(2, 3).then((r) => console.log(`${LOG} add -> ${r}`))">Add(2,3)</button>
    <button @click="slowEcho('slow', 2000).then((r) => console.log(`${LOG} slowEcho -> ${r}`))">
      SlowEcho(2s)
    </button>
    <button @click="onFail">Fail</button>
    <button @click="ping().then((ok) => console.log(`${LOG} ping sent: ${ok}`))">Ping</button>
    <button @click="leave().then((ok) => console.log(`${LOG} leave sent: ${ok}`))">Leave</button>
    <button @click="killConnection().then((ok) => console.log(`${LOG} kill sent: ${ok}`))">
      Kill
    </button>
    <button @click="connectionId().then((id) => console.log(`${LOG} connectionId -> ${id}`))">
      ConnectionId
    </button>
    <button @click="showCounter = !showCounter">Toggle counter</button>
    <Counter v-if="showCounter" />
  </div>
</template>
