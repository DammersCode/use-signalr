import { Component, signal } from "@angular/core";
import { injectHubEvent } from "./client";

@Component({ selector: "app-online-count", template: `{{ count() }} online` })
export class OnlineCountComponent {
  count = signal(0);

  constructor() {
    // A subscription keeps the lazy hub connected until this component is destroyed.
    injectHubEvent("/hubs/presence", "OnlineCount", (count) => this.count.set(count));
  }
}
