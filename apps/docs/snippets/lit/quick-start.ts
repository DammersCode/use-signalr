import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { ignoreAbort } from "./ignore-abort";
import { session } from "./provider";
import type { ChatMessage } from "./contract";

@customElement("chat-room")
export class ChatRoom extends LitElement {
  private roomId = "general";
  private rooms = session.hub(this, "/hubs/rooms");
  private joinRoom = this.rooms.invoke("JoinRoom");
  private sendMessage = this.rooms.invoke("SendMessage");
  @state() private messages: ChatMessage[] = [];
  private wasConnected = false;

  constructor() {
    super();
    this.rooms.on("MessageReceived", (message) => {
      if (message.roomId === this.roomId) this.messages = [...this.messages, message];
    });
  }

  updated() {
    const connected = this.rooms.status === "connected";
    if (connected && !this.wasConnected) this.joinRoom(this.roomId).catch(ignoreAbort);
    this.wasConnected = connected;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.wasConnected = false;
  }

  render() {
    return html`
      <ul>
        ${this.messages.map((message) => html`<li>${message.user}: ${message.text}</li>`)}
      </ul>
      <button ?disabled=${this.rooms.status !== "connected"} @click=${this.send}>Say hello</button>
    `;
  }

  private send() {
    this.sendMessage(this.roomId, "Hello").catch(ignoreAbort);
  }
}
