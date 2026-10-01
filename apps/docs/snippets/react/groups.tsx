import { useEffect } from "react";
import { useHubStatus, useSignalRInvoke, useSignalRTeardown } from "./client";
import { ignoreAbort } from "./ignore-abort";

export function RoomMembership({ roomId }: { roomId: string }) {
  const status = useHubStatus("/hubs/rooms");
  const joinRoom = useSignalRInvoke("/hubs/rooms", "JoinRoom");
  const leaveRoom = useSignalRTeardown("/hubs/rooms", "LeaveRoom");

  useEffect(() => {
    if (status !== "connected") return;
    joinRoom(roomId).catch(ignoreAbort);
  }, [status, roomId, joinRoom]);

  useEffect(() => {
    return () => {
      void leaveRoom(roomId);
    };
  }, [roomId, leaveRoom]);

  return null;
}
