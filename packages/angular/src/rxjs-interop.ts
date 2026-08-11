import { assertInInjectionContext } from "@angular/core";
import { toObservable } from "@angular/core/rxjs-interop";
import type { Injector, Signal } from "@angular/core";
import type { Observable } from "rxjs";
import type { HubConnectionStatus } from "@dammers/use-signalr-core";

export interface HubStatusObservableOptions {
  /** Injector to run outside an injection context (for example inside a service constructor). */
  injector?: Injector;
}

/**
 * Optional RxJS bridge for a hub status `Signal` returned by
 * `injectHubStatus`. Thin wrapper over `toObservable` — pulled into a
 * separate entry point so `rxjs` stays an optional peer, not a hard
 * dependency of the main package.
 *
 * @param statusSignal The `Signal<HubConnectionStatus>` from `injectHubStatus`.
 * @param options Optional `{ injector }`, required when called outside an
 *   injection context.
 * @returns An `Observable<HubConnectionStatus>` that emits on every status change.
 */
export function hubStatus$(
  statusSignal: Signal<HubConnectionStatus>,
  options?: HubStatusObservableOptions,
): Observable<HubConnectionStatus> {
  if (!options?.injector) assertInInjectionContext(hubStatus$);
  return toObservable(statusSignal, options);
}
