import * as solid from "solid-js";
import { isSolid2 } from "./solid-compat.js";

export { isSolid2, providerOf } from "./solid-compat.js";

const api = solid as unknown as Record<string, unknown>;

export const onMount = (isSolid2 ? api.onSettled : api.onMount) as (fn: () => void) => void;
const effectFn = (isSolid2 ? api.createTrackedEffect : api.createEffect) as (
  fn: () => void,
) => void;
export const createEffect = (fn: () => unknown) =>
  effectFn(() => {
    fn();
  });
