import { LitElement, html } from "lit";
import type { PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ignoreAbort } from "./ignore-abort";
import { session } from "./provider";

@customElement("room-members")
export class RoomMembers extends LitElement {
  @property() roomId = "general";
  private rooms = session.hub(this, "/hubs/rooms");
  private joinRoom = this.rooms.invoke("JoinRoom");
  private leaveRoom = this.rooms.teardown("LeaveRoom");
  private wasConnected = false;

  updated(changed: PropertyValues<this>) {
    const previous = changed.get("roomId");
    if (previous !== undefined && previous !== this.roomId) void this.leaveRoom(previous);

    const connected = this.rooms.status === "connected";
    if (connected && (!this.wasConnected || changed.has("roomId"))) {
      this.joinRoom(this.roomId).catch(ignoreAbort);
    }
    this.wasConnected = connected;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.wasConnected = false;
    queueMicrotask(() => {
      if (!this.isConnected) void this.leaveRoom(this.roomId);
    });
  }

  render() {
    return html``;
  }
}
