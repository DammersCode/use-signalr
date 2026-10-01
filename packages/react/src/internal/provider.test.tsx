import { createContext, use, useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import * as core from "@dammers/use-signalr-core";
import { createSignalRProvider } from "./create-provider.js";
import { createSignalRHooks } from "./create-hooks.js";
import type { SignalRContextValue } from "../types.js";

vi.mock("@dammers/use-signalr-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dammers/use-signalr-core")>();
  return { ...actual, createSignalRSession: vi.fn(actual.createSignalRSession) };
});

const HUB = "/hubs/chat" as const;
type Contract = { "/hubs/chat": Record<string, never> };

function makeClient() {
  const Context = createContext<SignalRContextValue<Contract> | null>(null);
  const resolved = core.resolveHubConfig({ hubs: { [HUB]: {} } }, HUB);
  const SignalRProvider = createSignalRProvider<Contract>(Context, [HUB], () => resolved);
  return { SignalRProvider, Context, hooks: createSignalRHooks<Contract>(Context) };
}

describe("provider session", () => {
  it("creates the session once across re-renders", () => {
    const { SignalRProvider } = makeClient();
    vi.mocked(core.createSignalRSession).mockClear();
    let bump!: () => void;
    function Tree() {
      const [n, setN] = useState(0);
      bump = () => setN((v) => v + 1);
      return (
        <SignalRProvider baseUrl={undefined} accessTokenFactory={() => `t${n}`}>
          {null}
        </SignalRProvider>
      );
    }
    render(<Tree />);
    act(() => bump());
    act(() => bump());
    expect(core.createSignalRSession).toHaveBeenCalledTimes(1);
  });
});

describe("hydration", () => {
  it("uses the initial status as server snapshot when the store is already connected", async () => {
    const { SignalRProvider, Context, hooks } = makeClient();
    function Preconnect({ on }: { on: boolean }) {
      const statusStore = use(Context)!.statusStore;
      if (on) statusStore.set(HUB, "connected");
      return null;
    }
    function Status() {
      return <span>{hooks.useHubStatus(HUB)}</span>;
    }
    const tree = (on: boolean) => (
      <SignalRProvider baseUrl={undefined} accessTokenFactory={() => "t"}>
        <Preconnect on={on} />
        <Status />
      </SignalRProvider>
    );

    const container = document.createElement("div");
    container.innerHTML = renderToString(tree(false));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const recoverable = vi.fn();
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, tree(true), { onRecoverableError: recoverable });
    });
    expect(recoverable).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
    act(() => root.unmount());
  });
});
