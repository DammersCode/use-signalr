import { Component, computed } from "@angular/core";
import type { HubConnectionStatus } from "@dammers/use-signalr-angular";
import { injectHubStatus } from "./client";

const labels: Record<HubConnectionStatus, string | null> = {
  idle: null,
  connecting: "Connecting...",
  connected: null,
  reconnecting: "Connection lost. Reconnecting...",
  disconnected: "Disconnected. Sign in again to reconnect.",
};

@Component({
  selector: "app-status-banner",
  template: `
    @if (label(); as text) {
      <p role="status">{{ text }}</p>
    }
  `,
})
export class StatusBannerComponent {
  private status = injectHubStatus("/hubs/rooms");
  label = computed(() => labels[this.status()]);
}
