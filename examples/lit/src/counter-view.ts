import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { createLogger } from "@examples/contract";
import { session } from "./client.js";

const log = createLogger("lit");

/** Added/removed by "Toggle counter" to exercise lazy connect + grace-period disconnect. */
@customElement("counter-view")
export class CounterView extends LitElement {
  private readonly counter = session.hub(this, "/hubs/counter", { reactiveStatus: true });
  private readonly leave = session.hub(this, "/hubs/chat").teardown("Leave");
  private count: number | null = null;
  private unsubscribeStatus?: () => void;

  constructor() {
    super();
    this.counter.on("Count", (value) => {
      log.count(value);
      this.count = value;
      this.requestUpdate();
    });
  }

  override connectedCallback() {
    super.connectedCallback();
    this.unsubscribeStatus = session.context.statusStore.subscribe("/hubs/counter", () => {
      log.status("/hubs/counter", this.counter.status);
    });
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubscribeStatus?.();
    void this.leave();
  }

  override createRenderRoot() {
    return this;
  }

  override render() {
    return html`
      <div>
        <p>counter hub status: ${this.counter.status}</p>
        <p>count: ${this.count ?? "(waiting)"}</p>
      </div>
    `;
  }
}
