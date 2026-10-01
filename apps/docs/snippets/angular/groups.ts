import { Component, effect, input } from "@angular/core";
import { injectHubInvoke, injectHubStatus, injectHubTeardown } from "./client";
import { ignoreAbort } from "./ignore-abort";

@Component({ selector: "app-room-members", template: "" })
export class RoomMembersComponent {
  roomId = input.required<string>();
  private status = injectHubStatus("/hubs/rooms");
  private joinRoom = injectHubInvoke("/hubs/rooms", "JoinRoom");
  private leaveRoom = injectHubTeardown("/hubs/rooms", "LeaveRoom");

  constructor() {
    effect(() => {
      const roomId = this.roomId();
      if (this.status() === "connected") this.joinRoom(roomId).catch(ignoreAbort);
    });
    effect((onCleanup) => {
      const roomId = this.roomId();
      onCleanup(() => void this.leaveRoom(roomId));
    });
  }
}
