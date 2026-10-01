import { assertInInjectionContext } from "@angular/core";
import { toObservable } from "@angular/core/rxjs-interop";
import type { Injector, Signal } from "@angular/core";
import type { Observable } from "rxjs";
import type { HubConnectionStatus } from "@dammers/use-signalr-core";

export interface HubStatusObservableOptions {
  /** Injector to run outside an injection context (for example inside a service constructor). */
  injector?: Injector;
}

/** Turns the `Signal` from `injectHubStatus` into an `Observable`. Pass `{ injector }` outside an injection context. */
export function hubStatus$(
  statusSignal: Signal<HubConnectionStatus>,
  options?: HubStatusObservableOptions,
): Observable<HubConnectionStatus> {
  if (!options?.injector) assertInInjectionContext(hubStatus$);
  return toObservable(statusSignal, options);
}
