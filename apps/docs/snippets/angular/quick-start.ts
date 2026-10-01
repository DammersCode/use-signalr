import { Component, effect, signal } from "@angular/core";
import { injectHubEvent, injectHubInvoke, injectHubStatus } from "./client";
import { ignoreAbort } from "./ignore-abort";
import type { ChatMessage } from "./contract";

@Component({
  selector: "app-room",
  template: `
    <ul>
      @for (message of messages(); track $index) {
        <li>{{ message.user }}: {{ message.text }}</li>
      }
    </ul>
    <button [disabled]="status() !== 'connected'" (click)="send()">Say hello</button>
  `,
})
export class RoomComponent {
  roomId = "general";
  messages = signal<ChatMessage[]>([]);
  status = injectHubStatus("/hubs/rooms");
  private joinRoom = injectHubInvoke("/hubs/rooms", "JoinRoom");
  private sendMessage = injectHubInvoke("/hubs/rooms", "SendMessage");

  constructor() {
    effect(() => {
      if (this.status() === "connected") this.joinRoom(this.roomId).catch(ignoreAbort);
    });
    injectHubEvent("/hubs/rooms", "MessageReceived", (message) => {
      if (message.roomId === this.roomId) this.messages.update((list) => [...list, message]);
    });
  }

  send() {
    this.sendMessage(this.roomId, "Hello").catch(ignoreAbort);
  }
}
