import { Component, afterNextRender, signal } from "@angular/core";
import { injectHubInvoke } from "./client";
import type { ChatMessage } from "./contract";

@Component({
  selector: "app-history",
  template: `
    @if (error()) {
      <p role="alert">{{ error() }}</p>
    }
    <p>{{ history().length }} messages</p>
  `,
})
export class HistoryComponent {
  history = signal<ChatMessage[]>([]);
  error = signal<string | null>(null);
  private getHistory = injectHubInvoke("/hubs/rooms", "GetHistory");

  constructor() {
    afterNextRender(() => void this.load("general"));
  }

  async load(roomId: string) {
    try {
      this.history.set(await this.getHistory(roomId));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      this.error.set(error instanceof Error ? error.message : String(error));
    }
  }
}
