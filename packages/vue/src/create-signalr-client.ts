import { hubKeys, resolveHubConfig } from "@dammers/use-signalr-core";
import type { InjectionKey } from "vue";
import type {
  HubDef,
  HubString,
  InferContract,
  ResolvedHubConfig,
  SignalRClientConfig,
} from "@dammers/use-signalr-core";
import { createComposables } from "./internal/create-composables";
import { createPlugin } from "./internal/create-plugin";
import type { SignalRContextValue } from "./types";

/** Creates a typed Vue plugin and the composables bound to its app context. */
export function createSignalRClient<const H extends Record<HubString, HubDef>>(
  config: SignalRClientConfig<H>,
) {
  type T = InferContract<H>;
  type Hub = keyof T & HubString;
  const hubs = hubKeys(config);
  const resolved = new Map<Hub, ResolvedHubConfig>(
    hubs.map((hub) => [hub, resolveHubConfig(config, config.hubs[hub])]),
  );
  const key: InjectionKey<SignalRContextValue<T>> = Symbol("use-signalr");
  const plugin = createPlugin<T>(key, hubs, (hub) => resolved.get(hub)!);
  return Object.assign(plugin, createComposables<T>(key));
}
