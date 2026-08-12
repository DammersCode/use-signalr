import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { InvokeError } from "@dammers/use-signalr-lit";
import { createLogger } from "@examples/contract";
import { session } from "./client.js";
import "./counter-view.js";

const log = createLogger("lit");

@customElement("app-root")
export class AppRoot extends LitElement {
  private readonly chat = session.hub(this, "/hubs/chat", { reactiveStatus: true });

  private readonly echo = this.chat.invoke("Echo");
  private readonly add = this.chat.invoke("Add");
  private readonly slowEcho = this.chat.invoke("SlowEcho");
  private readonly fail = this.chat.invoke("Fail", { retries: 1 });
  private readonly connectionId = this.chat.invoke("ConnectionId");
  private readonly ping = this.chat.send("Ping");
  private readonly leave = this.chat.send("Leave");
  private readonly killConnection = this.chat.send("KillConnection");

  private showCounter = false;
  private unsubscribeStatus?: () => void;

  constructor() {
    super();
    this.chat.on("Tick", (count) => {
      log.tick(count);
    });
    this.chat.on("Echoed", (text, at) => {
      log.echoed(text, at);
    });
    this.chat.on("Left", (id) => {
      log.left(id);
    });
    this.chat.onReconnected(() => {
      log.reconnected();
    });
  }

  override connectedCallback() {
    super.connectedCallback();
    this.unsubscribeStatus = session.context.statusStore.subscribe("/hubs/chat", () => {
      log.status("/hubs/chat", this.chat.status);
    });
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubscribeStatus?.();
  }

  override createRenderRoot() {
    return this;
  }

  private async onFail() {
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

  private toggleCounter() {
    this.showCounter = !this.showCounter;
    this.requestUpdate();
  }

  override render() {
    return html`
      <div>
        <h1>use-signalr: lit</h1>
        <p>Open the web console (F12) — that is where the magic happens.</p>
        <p>status /hubs/chat: ${this.chat.status}</p>
        <button @click=${() => this.echo("hello").then((r) => log.result("echo", r))}>
          Echo
        </button>
        <button @click=${() => this.add(2, 3).then((r) => log.result("add", r))}>
          Add(2,3)
        </button>
        <button
          @click=${() => this.slowEcho("slow", 2000).then((r) => log.result("slowEcho", r))}
        >
          SlowEcho(2s)
        </button>
        <button @click=${() => this.onFail()}>Fail</button>
        <button @click=${() => this.ping().then((ok) => log.sent("ping", ok))}>Ping</button>
        <button @click=${() => this.leave().then((ok) => log.sent("leave", ok))}>Leave</button>
        <button @click=${() => this.killConnection().then((ok) => log.sent("kill", ok))}>
          Kill
        </button>
        <button
          @click=${() => this.connectionId().then((id) => log.result("connectionId", id))}
        >
          ConnectionId
        </button>
        <button @click=${() => this.toggleCounter()}>Toggle counter</button>
        ${this.showCounter ? html`<counter-view></counter-view>` : ""}
      </div>
    `;
  }
}
