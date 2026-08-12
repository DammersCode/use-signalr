import { Component, effect } from "@angular/core";
import { InvokeError } from "@dammers/use-signalr-angular";
import { createLogger } from "@examples/contract";
import {
  injectHubEvent,
  injectHubInvoke,
  injectHubSend,
  injectOnReconnected,
  injectHubStatus,
} from "./client.js";
import { CounterComponent } from "./counter.component.js";

const log = createLogger("angular");

@Component({
  standalone: true,
  selector: "app-root",
  imports: [CounterComponent],
  template: `
    <div>
      <h1>use-signalr: angular</h1>
      <p>Open the web console (F12) — that is where the magic happens.</p>
      <p>status /hubs/chat: {{ chatStatus() }}</p>
      <button (click)="onEcho()">Echo</button>
      <button (click)="onAdd()">Add(2,3)</button>
      <button (click)="onSlowEcho()">SlowEcho(2s)</button>
      <button (click)="onFail()">Fail</button>
      <button (click)="onPing()">Ping</button>
      <button (click)="onLeave()">Leave</button>
      <button (click)="onKill()">Kill</button>
      <button (click)="onConnectionId()">ConnectionId</button>
      <button (click)="showCounter = !showCounter">Toggle counter</button>
      @if (showCounter) {
        <app-counter />
      }
    </div>
  `,
})
export class AppComponent {
  showCounter = false;
  chatStatus = injectHubStatus("/hubs/chat");

  private echo = injectHubInvoke("/hubs/chat", "Echo");
  private add = injectHubInvoke("/hubs/chat", "Add");
  private slowEcho = injectHubInvoke("/hubs/chat", "SlowEcho");
  private fail = injectHubInvoke("/hubs/chat", "Fail", { retries: 1 });
  private connectionId = injectHubInvoke("/hubs/chat", "ConnectionId");
  private ping = injectHubSend("/hubs/chat", "Ping");
  private leave = injectHubSend("/hubs/chat", "Leave");
  private killConnection = injectHubSend("/hubs/chat", "KillConnection");

  constructor() {
    injectHubEvent("/hubs/chat", "Tick", (count) => {
      log.tick(count);
    });
    injectHubEvent("/hubs/chat", "Echoed", (text, at) => {
      log.echoed(text, at);
    });
    injectHubEvent("/hubs/chat", "Left", (id) => {
      log.left(id);
    });
    injectOnReconnected("/hubs/chat", () => {
      log.reconnected();
    });

    effect(() => {
      log.status("/hubs/chat", this.chatStatus());
    });
  }

  onEcho() {
    void this.echo("hello").then((r) => log.result("echo", r));
  }

  onAdd() {
    void this.add(2, 3).then((r) => log.result("add", r));
  }

  onSlowEcho() {
    void this.slowEcho("slow", 2000).then((r) => log.result("slowEcho", r));
  }

  async onFail() {
    try {
      await this.fail();
    } catch (err) {
      if (err instanceof InvokeError) {
        log.invokeFailed(err);
      } else {
        log.log(`invoke failed: ${String(err)}`);
      }
    }
  }

  onPing() {
    void this.ping().then((ok) => log.sent("ping", ok));
  }

  onLeave() {
    void this.leave().then((ok) => log.sent("leave", ok));
  }

  onKill() {
    void this.killConnection().then((ok) => log.sent("kill", ok));
  }

  onConnectionId() {
    void this.connectionId().then((id) => log.result("connectionId", id));
  }
}
