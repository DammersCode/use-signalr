import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { session } from "./provider";
import type { ChatMessage } from "./contract";

@customElement("chat-history")
export class ChatHistory extends LitElement {
  private rooms = session.hub(this, "/hubs/rooms");
  private getHistory = this.rooms.invoke("GetHistory");
  @state() private history: ChatMessage[] = [];

  constructor() {
    super();
    this.rooms.onReconnected(() => void this.refetch());
  }

  connectedCallback() {
    super.connectedCallback();
    void this.refetch();
  }

  private async refetch() {
    try {
      this.history = await this.getHistory("general");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) console.error(error);
    }
  }

  render() {
    return html`${this.history.length} messages`;
  }
}
