import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { session } from "./provider";

@customElement("room-session")
export class RoomSession extends LitElement {
  private roomId = "general";
  private rooms = session.hub(this, "/hubs/rooms");
  private leaveRoom = this.rooms.teardown("LeaveRoom");

  disconnectedCallback() {
    super.disconnectedCallback();
    queueMicrotask(() => {
      if (!this.isConnected) void this.leaveRoom(this.roomId);
    });
  }

  render() {
    return html``;
  }
}
