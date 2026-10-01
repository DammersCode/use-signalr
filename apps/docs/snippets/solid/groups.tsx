import { createEffect, on, onCleanup } from "solid-js";
import { useHubStatus, useSignalRInvoke, useSignalRTeardown } from "./client";
import { ignoreAbort } from "./ignore-abort";

export function RoomMembership(props: { roomId: string }) {
  const status = useHubStatus("/hubs/rooms");
  const joinRoom = useSignalRInvoke("/hubs/rooms", "JoinRoom");
  const leaveRoom = useSignalRTeardown("/hubs/rooms", "LeaveRoom");

  createEffect(() => {
    if (status() !== "connected") return;
    joinRoom(props.roomId).catch(ignoreAbort);
  });

  createEffect(
    on(
      () => props.roomId,
      (roomId) => onCleanup(() => void leaveRoom(roomId)),
    ),
  );

  return null;
}
