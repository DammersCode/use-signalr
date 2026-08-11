import { readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "site");
const out = join(root, "dist-site");
const repo = "https://github.com/DammersCode/use-signalr";

const order = ["react", "vue", "svelte", "angular", "solid", "preact", "core"];
const accents = {
  react: "#61dafb",
  vue: "#42d392",
  svelte: "#ff7043",
  angular: "#f0326e",
  solid: "#5aa7f0",
  preact: "#a78bfa",
  core: "#94a3b8",
};
const labels = {
  react: "React",
  vue: "Vue",
  svelte: "Svelte",
  angular: "Angular",
  solid: "SolidJS",
  preact: "Preact",
  core: "Core",
};

const icons = {
  npm: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M2 4h20v14h-10v2H6v-2H2V4Zm2 2v10h4V8h2v8h2V6H4Zm10 0v10h2V8h2v8h2V6h-6Z"/></svg>`,
  book: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" d="M4 4.5h5.5A2.5 2.5 0 0 1 12 7v12a2 2 0 0 0-2-2H4V4.5Zm16 0h-5.5A2.5 2.5 0 0 0 12 7v12a2 2 0 0 1 2-2h6V4.5Z"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" d="M9 9h10v11H9zM5 15V4h10"/></svg>`,
};

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const dirs = readdirSync(join(root, "packages"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib);
  });

const packages = dirs.map((dir) => {
  const pkg = JSON.parse(readFileSync(join(root, "packages", dir, "package.json"), "utf8"));
  return {
    dir,
    name: pkg.name,
    version: pkg.version,
    description: pkg.description ?? "",
    label: labels[dir] ?? dir,
    accent: accents[dir] ?? accents.core,
  };
});

const card = (p) => `        <article class="card" style="--accent:${p.accent}">
          <div class="card-head">
            <div class="card-title">
              <h3>${esc(p.label)}</h3>
              <p class="pkg">${esc(p.name)}</p>
            </div>
            <div class="actions">
              <a class="icon-btn" href="https://www.npmjs.com/package/${esc(p.name)}"
                 aria-label="${esc(p.name)} on npm" title="View on npm" rel="noopener">${icons.npm}</a>
              <a class="icon-btn" href="${repo}/blob/main/packages/${p.dir}/README.md"
                 aria-label="${esc(p.label)} documentation" title="Read the docs" rel="noopener">${icons.book}</a>
            </div>
          </div>
          <p class="desc">${esc(p.description)}</p>
          <div class="install">
            <code>npm i ${esc(p.name)}</code>
            <button class="icon-btn copy" type="button" data-copy="npm i ${esc(p.name)}"
                    aria-label="Copy install command for ${esc(p.name)}" title="Copy">${icons.copy}</button>
          </div>
        </article>`;

mkdirSync(out, { recursive: true });
const html = readFileSync(join(src, "index.html"), "utf8")
  .replace("<!--CARDS-->", packages.map(card).join("\n"))
  .replace(/<!--VERSION-->/g, esc(packages[0]?.version ?? ""));
writeFileSync(join(out, "index.html"), html);
copyFileSync(join(src, "style.css"), join(out, "style.css"));
writeFileSync(join(out, ".nojekyll"), "");

console.log(`built ${packages.length} cards -> dist-site/`);
