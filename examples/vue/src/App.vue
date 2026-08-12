<script setup lang="ts">
import { ref, watch } from "vue";
import { InvokeError } from "@dammers/use-signalr-vue";
import { createLogger } from "@examples/contract";
import {
  useSignalREvent,
  useSignalRInvoke,
  useSignalRSend,
  useHubStatus,
  useOnReconnected,
} from "./client.js";
import Counter from "./Counter.vue";

const log = createLogger("vue");

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
  log.tick(count);
});
useSignalREvent("/hubs/chat", "Echoed", (text, at) => {
  log.echoed(text, at);
});
useSignalREvent("/hubs/chat", "Left", (id) => {
  log.left(id);
});
useOnReconnected("/hubs/chat", () => {
  log.reconnected();
});

watch(chatStatus, (status) => {
  log.status("/hubs/chat", status);
});

async function onFail() {
  try {
    await fail();
  } catch (err) {
    if (err instanceof InvokeError) {
      log.invokeFailed(err);
    } else {
      log.log(`invoke failed: ${String(err)}`);
    }
  }
}
</script>

<template>
  <div>
    <h1>use-signalr: vue</h1>
    <p>Open the web console (F12) — that is where the magic happens.</p>
    <p>status /hubs/chat: {{ chatStatus }}</p>
    <button @click="echo('hello').then((r) => log.result('echo', r))">Echo</button>
    <button @click="add(2, 3).then((r) => log.result('add', r))">Add(2,3)</button>
    <button @click="slowEcho('slow', 2000).then((r) => log.result('slowEcho', r))">
      SlowEcho(2s)
    </button>
    <button @click="onFail">Fail</button>
    <button @click="ping().then((ok) => log.sent('ping', ok))">Ping</button>
    <button @click="leave().then((ok) => log.sent('leave', ok))">Leave</button>
    <button @click="killConnection().then((ok) => log.sent('kill', ok))">
      Kill
    </button>
    <button @click="connectionId().then((id) => log.result('connectionId', id))">
      ConnectionId
    </button>
    <button @click="showCounter = !showCounter">Toggle counter</button>
    <Counter v-if="showCounter" />
  </div>
</template>
