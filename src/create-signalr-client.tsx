import { createContext } from "react";
import { hubKeys, resolveHubConfig } from "./config";
import { createSignalRProvider } from "./internal/create-provider";
import { createSignalRHooks } from "./internal/create-hooks";
import type {
  HubString,
  ResolvedHubConfig,
  SignalRClientConfig,
  SignalRContextValue,
  SignalRContract,
} from "./types";

/**
 * Create a fully-typed SignalR client bound to your contract `T`.
 * The KEYS of `config.hubs` declare the hubs — there is no separate `hubs`
 * array. Returns a Provider + hooks, all typed against `T`.
 *
 * @example
 * type AppHubs = {
 *   "/hubs/chat": {
 *     events: { ReceiveMessage: (user: string, msg: string) => void };
 *     methods: { SendMessage: (msg: string) => Promise<void> };
 *   };
 * };
 * export const { SignalRProvider, useSignalREffect, useSignalRInvoke } =
 *   createSignalRClient<AppHubs>({ hubs: { "/hubs/chat": {} } });
 */
export function createSignalRClient<T extends SignalRContract>(
  config: SignalRClientConfig<T>,
) {
  type Hub = keyof T & HubString;

  const hubs = hubKeys(config);
  const resolved = new Map<Hub, ResolvedHubConfig>(
    hubs.map((h) => [h, resolveHubConfig(config, config.hubs[h])]),
  );
  const resolve = (hub: Hub) => resolved.get(hub)!;

  const Context = createContext<SignalRContextValue<T> | null>(null);

  const SignalRProvider = createSignalRProvider<T>(Context, hubs, resolve);
  const hooks = createSignalRHooks<T>(Context);

  return {
    SignalRProvider,
    useSignalR: hooks.useSignalR,
    useHubConsumer: hooks.useHubConsumer,
    useSignalREffect: hooks.useSignalREffect,
    useSignalRInvoke: hooks.useSignalRInvoke,
    useSignalRSend: hooks.useSignalRSend,
    useHubStatus: hooks.useHubStatus,
    useOnReconnected: hooks.useOnReconnected,
  };
}
