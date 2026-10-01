import type { HubConnectionStatus } from "@dammers/use-signalr-preact";
import { useHubStatus } from "./client";

const messages: Record<HubConnectionStatus, string | null> = {
  idle: null,
  connecting: "Connecting...",
  connected: null,
  reconnecting: "Connection lost. Reconnecting...",
  disconnected: "Disconnected. Sign in again to reconnect.",
};

export function StatusBanner() {
  const message = messages[useHubStatus("/hubs/rooms")];
  return message && <p role="status">{message}</p>;
}
