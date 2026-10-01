import { onCleanup } from "solid-js";
import { useSignalRTeardown } from "./client";

export function LeaveOnCleanup(props: { roomId: string }) {
  const leaveRoom = useSignalRTeardown("/hubs/rooms", "LeaveRoom");

  onCleanup(() => {
    void leaveRoom(props.roomId);
  });

  return null;
}
