import * as solid from "solid-js";
import type { SolidNode } from "../types.js";

export const isSolid2 = "createTrackedEffect" in solid;

// The flat subset of the JSX element type that Solid 1 and Solid 2 share.
type ProviderElement = Node | string | number | boolean | null | undefined;
type ProviderComponent<V> = (props: { value: V; children: SolidNode }) => ProviderElement;

// Solid 2 splits createEffect into a compute and an effect phase; Solid 1 takes one function.
const createSplitEffect = solid.createEffect as unknown as <V>(
  compute: () => V,
  effect: (value: V) => void,
) => void;
const createJoinedEffect = solid.createEffect as unknown as (fn: () => void) => void;
const renderComponent = solid.createComponent as unknown as <V>(
  component: ProviderComponent<V>,
  props: { value: V; readonly children: SolidNode },
) => ProviderElement;

/** Runs `apply` when the tracked reads in `read` change; `apply` itself is untracked. */
export function createPropsEffect<V>(read: () => V, apply: (value: V) => void): void {
  if (isSolid2) {
    createSplitEffect(read, (value) => {
      apply(value);
    });
    return;
  }
  createJoinedEffect(() => {
    const value = read();
    solid.untrack(() => apply(value));
  });
}

/** Solid 2 makes the context itself the provider component; Solid 1 has `Context.Provider`. */
export function providerOf<V>(context: unknown): ProviderComponent<V> {
  return ((context as { Provider?: unknown }).Provider ?? context) as ProviderComponent<V>;
}

export function renderProvider<V>(
  context: unknown,
  value: V,
  children: () => SolidNode,
): ProviderElement {
  return renderComponent(providerOf<V>(context), {
    value,
    get children() {
      return children();
    },
  });
}
