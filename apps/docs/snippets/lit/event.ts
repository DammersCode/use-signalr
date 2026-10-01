import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { session } from "./provider";
import type { ChatMessage } from "./contract";

@customElement("chat-feed")
export class ChatFeed extends LitElement {
  @property() roomId = "general";
  private rooms = session.hub(this, "/hubs/rooms");
  @state() private messages: ChatMessage[] = [];

  constructor() {
    super();
    this.rooms.on("MessageReceived", (message) => {
      if (message.roomId === this.roomId) this.messages = [...this.messages, message];
    });
  }

  render() {
    return html`
      <ul>
        ${this.messages.map((message) => html`<li>${message.user}: ${message.text}</li>`)}
      </ul>
    `;
  }
}
