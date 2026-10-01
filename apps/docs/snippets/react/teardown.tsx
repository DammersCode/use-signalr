import { useEffect } from "react";
import { useSignalRTeardown } from "./client";

export function LeaveOnUnmount({ roomId }: { roomId: string }) {
  const leaveRoom = useSignalRTeardown("/hubs/rooms", "LeaveRoom");

  useEffect(() => {
    return () => {
      void leaveRoom(roomId);
    };
  }, [roomId, leaveRoom]);

  return null;
}
