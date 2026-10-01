import { Component, input, signal } from "@angular/core";
import { injectHubEvent } from "./client";
import type { ChatMessage } from "./contract";

@Component({
  selector: "app-feed",
  template: `
    <ul>
      @for (message of messages(); track $index) {
        <li>{{ message.user }}: {{ message.text }}</li>
      }
    </ul>
  `,
})
export class FeedComponent {
  roomId = input.required<string>();
  messages = signal<ChatMessage[]>([]);

  constructor() {
    injectHubEvent("/hubs/rooms", "MessageReceived", (message) => {
      if (message.roomId === this.roomId()) this.messages.update((list) => [...list, message]);
    });
  }
}
