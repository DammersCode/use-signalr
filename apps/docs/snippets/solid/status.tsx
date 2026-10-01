import { Match, Switch } from "solid-js";
import { useHubStatus } from "./client";

export function StatusBanner() {
  const status = useHubStatus("/hubs/rooms");

  return (
    <Switch>
      <Match when={status() === "connecting"}>
        <p role="status">Connecting...</p>
      </Match>
      <Match when={status() === "reconnecting"}>
        <p role="status">Connection lost. Reconnecting...</p>
      </Match>
      <Match when={status() === "disconnected"}>
        <p role="status">Disconnected. Sign in again to reconnect.</p>
      </Match>
    </Switch>
  );
}
