import { signalR } from "./client";

export const session = signalR.createSession({
  baseUrl: "https://api.example.com",
  accessTokenFactory: () => localStorage.getItem("token") ?? "",
  onError: (hub, error, info) => console.error(hub, info.source, error),
});
