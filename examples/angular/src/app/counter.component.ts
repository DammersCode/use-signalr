import { Component, effect, signal } from "@angular/core";
import type { OnDestroy } from "@angular/core";
import { createLogger } from "@examples/contract";
import { injectHubEvent, injectHubTeardown, injectHubStatus } from "./client.js";

const log = createLogger("angular");

/** Mounted/unmounted via "Toggle counter" to exercise lazy connect + grace-period disconnect. */
@Component({
  standalone: true,
  selector: "app-counter",
  template: `
    <div>
      <p>counter hub status: {{ status() }}</p>
      <p>count: {{ count() ?? "(waiting)" }}</p>
    </div>
  `,
})
export class CounterComponent implements OnDestroy {
  status = injectHubStatus("/hubs/counter");
  count = signal<number | null>(null);

  private leave = injectHubTeardown("/hubs/chat", "Leave");

  constructor() {
    injectHubEvent("/hubs/counter", "Count", (value) => {
      log.count(value);
      this.count.set(value);
    });

    effect(() => {
      log.status("/hubs/counter", this.status());
    });
  }

  ngOnDestroy() {
    void this.leave();
  }
}
