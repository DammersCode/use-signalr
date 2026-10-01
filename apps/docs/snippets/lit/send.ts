import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { session } from "./provider";

@customElement("chat-composer")
export class ChatComposer extends LitElement {
  private rooms = session.hub(this, "/hubs/rooms");
  private sendMessage = this.rooms.send("SendMessage");
  @state() private dropped = false;

  private async submit(text: string) {
    const sent = await this.sendMessage("general", text);
    this.dropped = !sent;
  }

  render() {
    return html`
      <button @click=${() => this.submit("Hello")}>Send</button>
      ${this.dropped ? html`<p>Not connected. The message was not sent.</p>` : nothing}
    `;
  }
}
