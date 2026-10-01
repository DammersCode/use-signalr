import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { createSignalRClient, method } from "@dammers/use-signalr-lit";

const { createSession } = createSignalRClient({
  hubs: {
    "/hubs/rooms": {
      methods: { GetHistory: method<[roomId: string], { text: string }[]>() },
    },
  },
});
const session = createSession({ baseUrl: "https://api.example.com", accessTokenFactory: () => "token" });

@customElement("history-count")
export class HistoryCount extends LitElement {
  private rooms = session.hub(this, "/hubs/rooms");
  private getHistory = this.rooms.invoke("GetHistory");
  @state() private count = 0;

  private load() {
    this.getHistory("general").then((m) => (this.count = m.length)).catch(console.error);
  }

  render() {
    return html`<button @click=${this.load}>${this.count} messages</button>`;
  }
}
