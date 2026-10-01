import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { session } from "./provider";

@customElement("online-count")
export class OnlineCount extends LitElement {
  private presence = session.hub(this, "/hubs/presence");
  @state() private count = 0;

  constructor() {
    super();
    this.presence.on("OnlineCount", (count) => {
      this.count = count;
    });
  }

  render() {
    return html`${this.count} online`;
  }
}
