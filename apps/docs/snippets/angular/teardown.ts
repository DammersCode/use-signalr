import { Component, DestroyRef, inject } from "@angular/core";
import { injectHubTeardown } from "./client";

@Component({ selector: "app-room-session", template: "" })
export class RoomSessionComponent {
  private roomId = "general";
  private leaveRoom = injectHubTeardown("/hubs/rooms", "LeaveRoom");

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      void this.leaveRoom(this.roomId);
    });
  }
}
