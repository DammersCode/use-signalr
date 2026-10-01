import { Component, signal } from "@angular/core";
import { injectHubSend } from "./client";

@Component({
  selector: "app-composer",
  template: `
    <button (click)="submit('Hello')">Send</button>
    @if (dropped()) {
      <p>Not connected. The message was not sent.</p>
    }
  `,
})
export class ComposerComponent {
  dropped = signal(false);
  private sendMessage = injectHubSend("/hubs/rooms", "SendMessage");

  async submit(text: string) {
    const sent = await this.sendMessage("general", text);
    this.dropped.set(!sent);
  }
}
