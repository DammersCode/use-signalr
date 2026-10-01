import { Component, afterNextRender, signal } from "@angular/core";
import { injectHubInvoke, injectOnReconnected } from "./client";
import type { ChatMessage } from "./contract";

@Component({ selector: "app-history", template: `{{ history().length }} messages` })
export class HistoryComponent {
  history = signal<ChatMessage[]>([]);
  private getHistory = injectHubInvoke("/hubs/rooms", "GetHistory");

  constructor() {
    afterNextRender(() => void this.refetch());
    injectOnReconnected("/hubs/rooms", () => void this.refetch());
  }

  private async refetch() {
    try {
      this.history.set(await this.getHistory("general"));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) console.error(error);
    }
  }
}
