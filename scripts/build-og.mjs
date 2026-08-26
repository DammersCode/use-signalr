// Renders the 1200x630 social card into site/og.png. Run after a site build:
//   npm run build:og      (needs playwright + chromium, dev-only)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as si from "simple-icons";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

const marks = [
  ["siReact", "#61dafb"],
  ["siVuedotjs", "#42d392"],
  ["siSvelte", "#ff7043"],
  ["siAngular", "#f0326e"],
  ["siSolid", "#5aa7f0"],
  ["siPreact", "#a78bfa"],
  ["siLit", "#5b7cff"],
];

const glyphs = marks
  .map(
    ([slug, hex]) =>
      `<svg viewBox="0 0 24 24" style="color:${hex}"><path fill="currentColor" d="${si[slug].path}"/></svg>`,
  )
  .join("");

const html = `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}
  body{width:1200px;height:630px;background:#08090c;overflow:hidden;position:relative;
    font-family:"Segoe UI",ui-sans-serif,system-ui,sans-serif;color:#e8eaf0;
    display:flex;flex-direction:column;justify-content:center;padding:0 84px}
  .glow{position:absolute;inset:0;pointer-events:none;
    background:radial-gradient(38% 46% at 50% 8%,rgba(120,226,255,.20),transparent 70%),
      radial-gradient(64% 62% at 50% 8%,rgba(167,139,250,.12),transparent 78%)}
  .ring{position:absolute;left:50%;top:8%;translate:-50% -50%;border-radius:50%;aspect-ratio:1}
  .r1{width:620px;background:radial-gradient(circle closest-side,transparent 0 96.5%,rgba(150,218,255,.16) 98.4%,rgba(150,218,255,.5) 99.5%,transparent 100%)}
  .r2{width:1020px;background:radial-gradient(circle closest-side,transparent 0 96.5%,rgba(178,152,255,.14) 98.4%,rgba(178,152,255,.42) 99.5%,transparent 100%)}
  .r3{width:1420px;background:radial-gradient(circle closest-side,transparent 0 96.5%,rgba(110,240,180,.10) 98.4%,rgba(110,240,180,.3) 99.5%,transparent 100%)}
  h1{position:relative;font-size:76px;line-height:1.06;letter-spacing:-.03em;font-weight:680}
  p{position:relative;margin-top:22px;font-size:27px;line-height:1.45;color:#9aa1b1;max-width:20ch}
  .row{position:relative;display:flex;gap:26px;margin-top:44px;align-items:center}
  .row svg{width:46px;height:46px}
  .meta{position:absolute;left:84px;bottom:52px;font-family:Consolas,ui-monospace,monospace;
    font-size:21px;color:#838b9e;letter-spacing:.02em}
</style>
<div class="glow"></div>
<div class="ring r1"></div><div class="ring r2"></div><div class="ring r3"></div>
<h1>Want to use SignalR?<br>You're in the right place.</h1>
<p>Typed multi-hub clients for every framework worth arguing about.</p>
<div class="row">${glyphs}</div>
<div class="meta">v${version} &middot; MIT &middot; zero-dependency core</div>`;

const { chromium } = await import("playwright");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: "load" });
await page.waitForTimeout(300);
mkdirSync(join(root, "site"), { recursive: true });
await page.screenshot({ path: join(root, "site", "og.png") });
await browser.close();

console.log("wrote site/og.png (1200x630)");
