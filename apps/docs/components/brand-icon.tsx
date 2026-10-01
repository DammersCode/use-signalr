import { siAngular, siLit, siPreact, siReact, siSolid, siSvelte, siVuedotjs } from "simple-icons";

const brands = {
  react: siReact,
  vue: siVuedotjs,
  angular: siAngular,
  svelte: siSvelte,
  preact: siPreact,
  solid: siSolid,
  lit: siLit,
};

export type BrandName = keyof typeof brands;

export function BrandIcon({ name, className }: { name: string; className?: string }) {
  const icon = brands[name as BrandName];
  if (!icon) return null;
  // A near-black brand colour vanishes on the dark theme, so it follows the text colour instead.
  const dark = parseInt(icon.hex.slice(0, 2), 16) + parseInt(icon.hex.slice(2, 4), 16) + parseInt(icon.hex.slice(4, 6), 16) < 120;
  return (
    <svg role="img" aria-label={icon.title} viewBox="0 0 24 24" className={className} fill={dark ? "currentColor" : `#${icon.hex}`}>
      <path d={icon.path} />
    </svg>
  );
}
