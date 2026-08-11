import { createContext } from "preact";
import { hubKeys, resolveHubConfig } from "@dammers/use-signalr-core";
import type { HubDef, HubString, InferContract, ResolvedHubConfig, SignalRClientConfig } from "@dammers/use-signalr-core";
import { createSignalRHooks } from "./internal/create-hooks";
import { createSignalRProvider } from "./internal/create-provider";
import type { SignalRContextValue } from "./types";

export function createSignalRClient<const H extends Record<HubString, HubDef>>(config: SignalRClientConfig<H>) {
  type T = InferContract<H>;
  type Hub = keyof T & HubString;
  const hubs = hubKeys(config);
  const resolved = new Map<Hub, ResolvedHubConfig>(hubs.map((hub) => [hub, resolveHubConfig(config, config.hubs[hub])]));
  const Context = createContext<SignalRContextValue<T> | null>(null);
  const resolve = (hub: Hub) => resolved.get(hub)!;
  const SignalRProvider = createSignalRProvider<T>(Context, hubs, resolve);
  return { SignalRProvider, ...createSignalRHooks<T>(Context) };
}
