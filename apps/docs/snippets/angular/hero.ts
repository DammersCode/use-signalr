import { Component, signal } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { createSignalRClient, method } from "@dammers/use-signalr-angular";

const { provideSignalR, injectHubInvoke } = createSignalRClient({
  hubs: {
    "/hubs/rooms": {
      methods: { GetHistory: method<[roomId: string], { text: string }[]>() },
    },
  },
});

@Component({ selector: "app-root", template: `<button (click)="load()">{{ count() }} messages</button>` })
export class HistoryCount {
  private getHistory = injectHubInvoke("/hubs/rooms", "GetHistory");
  count = signal(0);

  load() {
    this.getHistory("general").then((m) => this.count.set(m.length)).catch(console.error);
  }
}

bootstrapApplication(HistoryCount, {
  providers: [provideSignalR({ baseUrl: "https://api.example.com", accessTokenFactory: () => "token" })],
});
