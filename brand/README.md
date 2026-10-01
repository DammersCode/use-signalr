# use-signalr brand

## The mark

The symbol is an S of two arcs in an amber badge. A white dot sits between the arcs: it is the signal between server and client. The wordmark "use-signalr" is a custom monoline in the same stroke style.

## Files

`python brand/gen_kit.py` builds every SVG below into `apps/docs/public/brand`. The script uses only the Python standard library. Change a colour, a stroke, or a letter there, then run it again.

The favicons and app icons in `apps/docs/public` are PNG renders of `symbol.svg` and `symbol-small.svg`.

| File | Use |
|---|---|
| `symbol.svg` | Default symbol on any background |
| `symbol-small.svg` | 16 to 24 px (favicon, tabs) |
| `symbol-black.svg`, `symbol-white.svg`, `symbol-amber.svg` | One colour, with real cut-outs |
| `lockup-horizontal-on-dark.svg`, `lockup-horizontal-on-light.svg` | Headers, README, social cards |
| `lockup-stacked-on-dark.svg`, `lockup-stacked-on-light.svg` | Square spaces |
| `lockup-horizontal-black.svg`, `lockup-horizontal-white.svg` | One-colour print |
| `wordmark-*.svg` | Text only, when the symbol is already near |
| `apps/docs/public/favicon.*`, `*icon*.png`, `site.webmanifest` | Favicons and app icons for the docs site |

## Colours (Eclipse)

| Role | Hex | RGB |
|---|---|---|
| Brand amber (badge, primary button) | `#F5A524` | 245, 165, 36 |
| Ink on amber (the S, button text) | `#1A1203` | 26, 18, 3 |
| Signal dot | `#FFFFFF` | 255, 255, 255 |
| Dark background | `#0B0B0F` | 11, 11, 15 |
| Text on dark | `#F4F4F5` | 244, 244, 245 |
| Light background | `#FAFAF9` | 250, 250, 249 |
| Text on light | `#18181B` | 24, 24, 27 |
| Amber text on light (links) | `#9A5F00` | 154, 95, 0 |

The S on the badge has a contrast of about 9:1. Use amber `#F5A524` as text only on dark backgrounds. On light backgrounds, use `#9A5F00` (5:1).

## Dark and light mode

The symbol is the same file in both modes. Only the wordmark changes colour: use the `on-dark` file on dark backgrounds and the `on-light` file on light backgrounds. In a README, switch them with `<picture>`:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/DammersCode/use-signalr/main/apps/docs/public/brand/lockup-horizontal-on-dark.svg">
  <img alt="use-signalr" src="https://raw.githubusercontent.com/DammersCode/use-signalr/main/apps/docs/public/brand/lockup-horizontal-on-light.svg" height="48">
</picture>
```

## Clear space and size

- Keep free space around the logo equal to the radius of the badge's signal dot times 4 (about 20% of the badge diameter) on all sides.
- Smallest symbol: 16 px on screen (use `symbol-small.svg` below 24 px), 6 mm in print.
- Smallest horizontal lockup: 96 px wide on screen.

## Do not

- Change the colours outside this palette, or give the dot the badge colour.
- Rotate, stretch, outline, or add shadows or gradients.
- Set the wordmark in another typeface.
- Put the coloured badge on a busy photo; use a one-colour version there.

## Notes

- The wordmark is drawn as paths and needs no font.
