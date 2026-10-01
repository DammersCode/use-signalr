import { event, method } from "@dammers/use-signalr-core";

export interface ChatMessage {
  roomId: string;
  user: string;
  text: string;
  sentAt: string;
}

// Keys are hub paths. Names and argument types match the server hub.
export const hubs = {
  "/hubs/rooms": {
    events: {
      MessageReceived: event<[message: ChatMessage]>(),
    },
    methods: {
      JoinRoom: method<[roomId: string]>(),
      LeaveRoom: method<[roomId: string]>(),
      SendMessage: method<[roomId: string, text: string]>(),
      GetHistory: method<[roomId: string], ChatMessage[]>(),
    },
  },
  "/hubs/presence": {
    lazy: true,
    graceMs: 2000,
    events: {
      OnlineCount: event<[count: number]>(),
    },
  },
};
