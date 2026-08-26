import { readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as si from "simple-icons";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "site");
const out = join(root, "dist-site");
const repo = "https://github.com/DammersCode/use-signalr";

const order = ["react", "vue", "svelte", "angular", "solid", "preact", "lit", "core"];
const accents = {
  react: "#61dafb",
  vue: "#42d392",
  svelte: "#ff7043",
  angular: "#f0326e",
  solid: "#5aa7f0",
  preact: "#a78bfa",
  lit: "#5b7cff",
  core: "#94a3b8",
};
const labels = {
  react: "React",
  vue: "Vue",
  svelte: "Svelte",
  angular: "Angular",
  solid: "SolidJS",
  preact: "Preact",
  lit: "Lit",
  core: "Core",
};

// brand glyphs from simple-icons; the card accent supplies the colour, since
// Angular's and Solid's official hexes are too dark to read on this ground
const brandSlugs = {
  react: "siReact",
  vue: "siVuedotjs",
  svelte: "siSvelte",
  angular: "siAngular",
  solid: "siSolid",
  preact: "siPreact",
  lit: "siLit",
};

// core has no brand mark; a hub glyph keeps its title on the same optical baseline
const coreMark = `<svg class="brand" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="2.6"/><path d="M12 3.2a8.8 8.8 0 0 1 0 17.6M12 3.2a8.8 8.8 0 0 0 0 17.6" opacity=".55"/><path d="M4.4 7.6a8.8 8.8 0 0 0 15.2 8.8M19.6 7.6a8.8 8.8 0 0 1-15.2 8.8" opacity=".3"/></g></svg>`;

const brand = (dir) => {
  const icon = si[brandSlugs[dir]];
  if (!icon) return dir === "core" ? coreMark : "";
  return `<svg class="brand" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="${icon.path}"/></svg>`;
};

const icons = {
  npm: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M2 4h20v14h-10v2H6v-2H2V4Zm2 2v10h4V8h2v8h2V6H4Zm10 0v10h2V8h2v8h2V6h-6Z"/></svg>`,
  book: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" d="M4 4.5h5.5A2.5 2.5 0 0 1 12 7v12a2 2 0 0 0-2-2H4V4.5Zm16 0h-5.5A2.5 2.5 0 0 0 12 7v12a2 2 0 0 1 2-2h6V4.5Z"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" d="M9 9h10v11H9zM5 15V4h10"/></svg>`,
};

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const contract = `  hubs: {
    "/hubs/chat": {
      methods: { SendMessage: method<[roomId: string, message: string]>() },
    },
  },
});`;
const typedNote = `// send is typed from the contract — no generics at the call site`;

// one snippet per adapter, using that framework's real exported names
const snippets = {
  react: `const { SignalRProvider, useSignalRInvoke } = createSignalRClient({
${contract}

${typedNote}
const send = useSignalRInvoke("/hubs/chat", "SendMessage");`,
  vue: `const signalR = createSignalRClient({
${contract}
const { useSignalRInvoke } = signalR; // signalR is also the plugin: app.use(signalR)

${typedNote}
const send = useSignalRInvoke("/hubs/chat", "SendMessage");`,
  svelte: `const { provideSignalR, hubInvoke } = createSignalRClient({
${contract}

${typedNote}
const send = hubInvoke("/hubs/chat", "SendMessage");`,
  angular: `const { provideSignalR, injectHubInvoke } = createSignalRClient({
${contract}

${typedNote}
// inject* runs in an injection context: a field or constructor
private send = injectHubInvoke("/hubs/chat", "SendMessage");`,
  solid: `const { SignalRProvider, useSignalRInvoke } = createSignalRClient({
${contract}

${typedNote}
const send = useSignalRInvoke("/hubs/chat", "SendMessage");`,
  preact: `const signalR = createSignalRClient({
${contract}

${typedNote}
const send = signalR.useSignalRInvoke("/hubs/chat", "SendMessage");`,
  lit: `const { createSession } = createSignalRClient({
${contract}
export const session = createSession({ baseUrl });

${typedNote}
// inside a LitElement — session.hub() is a Reactive Controller
chat = session.hub(this, "/hubs/chat");
send = this.chat.invoke("SendMessage");`,
};

// single pass: chained .replace() would re-match the class= attributes it just emitted
const TOKENS =
  /(\/\/[^\n]*)|("(?:[^"\\]|\\.)*")|\b(const|export|private)\b|\b(createSignalRClient|createSession|method|useSignalRInvoke|hubInvoke|injectHubInvoke)\b|\b(string)\b/g;

const highlight = (code) => {
  let out = "";
  let last = 0;
  for (const m of code.matchAll(TOKENS)) {
    const [text, comment, str, kw, fn] = m;
    const cls = comment ? "c" : str ? "s" : kw ? "k" : fn ? "f" : "t";
    out += esc(code.slice(last, m.index)) + `<span class="${cls}">${esc(text)}</span>`;
    last = m.index + text.length;
  }
  return out + esc(code.slice(last));
};

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
              <h3>${brand(p.dir)}${esc(p.label)}</h3>
              <p class="pkg">${esc(p.name)}</p>
            </div>
            <div class="actions">
              <a class="icon-btn" href="https://www.npmjs.com/package/${esc(p.name)}"
                 aria-label="${esc(p.name)} on npm (opens in a new tab)" title="View on npm"
                 target="_blank" rel="noopener">${icons.npm}</a>
              <a class="icon-btn" href="${repo}/blob/main/packages/${p.dir}/README.md"
                 aria-label="${esc(p.label)} documentation (opens in a new tab)" title="Read the docs"
                 target="_blank" rel="noopener">${icons.book}</a>
            </div>
          </div>
          <p class="desc">${esc(p.description)}</p>
          <div class="install">
            <code>npm i ${esc(p.name)}</code>
            <button class="icon-btn copy" type="button" data-copy="npm i ${esc(p.name)}"
                    aria-label="Copy install command for ${esc(p.name)}" title="Copy">${icons.copy}</button>
          </div>
        </article>`;

const adapters = packages.filter((p) => p.dir !== "core");
const core = packages.find((p) => p.dir === "core");

const tab = (p, i) => `          <button class="tab" type="button" role="tab" id="tab-${p.dir}"
                  aria-controls="pane-${p.dir}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}"
                  style="--accent:${p.accent}">${brand(p.dir)}${esc(p.label)}</button>`;

const pane = (p, i) => `        <div class="pane" role="tabpanel" id="pane-${p.dir}" aria-labelledby="tab-${p.dir}"
             style="--accent:${p.accent}"${i === 0 ? "" : " hidden"}><pre>${highlight(snippets[p.dir] ?? "")}</pre></div>`;

mkdirSync(out, { recursive: true });
const html = readFileSync(join(src, "index.html"), "utf8")
  .replace("<!--CARDS-->", adapters.map(card).join("\n"))
  .replace("<!--CORE-->", core ? card(core) : "")
  .replace("<!--TABS-->", adapters.map(tab).join("\n"))
  .replace("<!--PANES-->", adapters.map(pane).join("\n"))
  .replace(/<!--VERSION-->/g, esc(packages[0]?.version ?? ""));
writeFileSync(join(out, "index.html"), html);
copyFileSync(join(src, "style.css"), join(out, "style.css"));
copyFileSync(join(src, "og.png"), join(out, "og.png"));
writeFileSync(join(out, ".nojekyll"), "");

console.log(`built ${adapters.length} adapter cards${core ? " + core" : ""} -> dist-site/`);
