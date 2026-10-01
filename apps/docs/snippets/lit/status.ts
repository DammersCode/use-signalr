import { LitElement, html, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { session } from "./provider";
import type { HubConnectionStatus } from "@dammers/use-signalr-lit";

const labels: Record<HubConnectionStatus, string | null> = {
  idle: null,
  connecting: "Connecting...",
  connected: null,
  reconnecting: "Connection lost. Reconnecting...",
  disconnected: "Disconnected. Sign in again to reconnect.",
};

@customElement("status-banner")
export class StatusBanner extends LitElement {
  private rooms = session.hub(this, "/hubs/rooms");

  render() {
    const label = labels[this.rooms.status];
    return label ? html`<p role="status">${label}</p>` : nothing;
  }
}
