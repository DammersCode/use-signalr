import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { session } from "./provider";
import type { ChatMessage } from "./contract";

@customElement("chat-history")
export class ChatHistory extends LitElement {
  private rooms = session.hub(this, "/hubs/rooms");
  private getHistory = this.rooms.invoke("GetHistory");
  @state() private history: ChatMessage[] = [];
  @state() private error?: string;

  connectedCallback() {
    super.connectedCallback();
    void this.load("general");
  }

  private async load(roomId: string) {
    try {
      this.history = await this.getHistory(roomId);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      this.error = error instanceof Error ? error.message : String(error);
    }
  }

  render() {
    return html`
      ${this.error ? html`<p role="alert">${this.error}</p>` : nothing}
      <p>${this.history.length} messages</p>
    `;
  }
}
