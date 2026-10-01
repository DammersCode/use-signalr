// Builds content/docs from content/src: shared pages go into every framework folder,
// and the framework tags (<Api>, <Only>, <Snippet>, <InstallCommand>) become plain Markdown.
// <AutoTypeTable> passes through unchanged, after a check that its type exists.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "content/src");
const outArg = process.argv.indexOf("--out");
// --out lets several writers generate at once without sharing one folder.
const out = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.join(root, "content/docs");
const snippets = path.join(root, "snippets");
const repo = path.resolve(root, "../..");
const { order, frameworks, core } = JSON.parse(fs.readFileSync(path.join(root, "content/frameworks.json"), "utf8"));
const nav = JSON.parse(fs.readFileSync(path.join(src, "nav.json"), "utf8"));
const strict = process.argv.includes("--strict");

const LANG = { ts: "ts", tsx: "tsx", svelte: "svelte", vue: "vue", cs: "csharp", json: "json", html: "html" };
const CUT = /^.*\/\/ ---cut---.*\r?\n/m;

function fence(file, code) {
  // Lines above the cut marker hold setup that the sample needs to compile but the reader does not.
  const cut = code.match(CUT);
  if (cut) code = code.slice(cut.index + cut[0].length);
  const ext = file.slice(file.lastIndexOf(".") + 1);
  return "```" + (LANG[ext] ?? ext) + ` title="${path.basename(file)}"\n${code.trimEnd()}\n` + "```";
}

function readSnippet(fw, id) {
  for (const dir of [fw, "shared"]) {
    const folder = path.join(snippets, dir);
    if (!fs.existsSync(folder)) continue;
    const file = fs.readdirSync(folder).find((f) => f.slice(0, f.lastIndexOf(".")) === id);
    if (!file) continue;
    let code = fs.readFileSync(path.join(folder, file), "utf8");
    if (!code.trim()) throw new Error(`Snippet "${id}" is empty (snippets/${dir}/${file})`);
    // Shared samples import from core so they compile once; the reader sees their own package.
    if (dir === "shared" && frameworks[fw]) code = code.replaceAll("@dammers/use-signalr-core", frameworks[fw].package);
    return fence(file, code);
  }
  throw new Error(`Snippet "${id}" is missing for ${fw} (snippets/${fw}/${id}.*)`);
}

function checkTypeTable(file, from, name) {
  const target = path.resolve(root, from);
  if (!fs.existsSync(target)) throw new Error(`${file}: <AutoTypeTable path="${from}"/> points to a missing file`);
  const declaration = new RegExp(String.raw`^export\s+(?:interface|type)\s+${name}\b`, "m");
  if (!declaration.test(fs.readFileSync(target, "utf8"))) {
    throw new Error(`${file}: ${from} does not export a type or interface named "${name}"`);
  }
}

function transform(text, fw, file) {
  const info = frameworks[fw] ?? core;
  for (const [, from, name] of text.matchAll(/<AutoTypeTable path="([^"]+)" name="([^"]+)"\s*\/>/g)) checkTypeTable(file, from, name);
  return text
    .replace(/<Only (in|not)="([^"]+)">\r?\n?([\s\S]*?)<\/Only>\r?\n?/g, (_, mode, list, body) =>
      list.split(",").map((s) => s.trim()).includes(fw) === (mode === "in") ? body : "")
    .replace(/<Snippet id="([^"]+)"\s*\/>/g, (_, id) => readSnippet(fw, id))
    .replace(/<Snippet file="([^"]+)"\s*\/>/g, (_, rel) => fence(rel, fs.readFileSync(path.join(repo, rel), "utf8")))
    .replace(/<Api of="([^"]+)"\s*\/>/g, (_, key) => {
      const name = info.api?.[key];
      if (!name) throw new Error(`${file}: <Api of="${key}"/> has no name for ${fw}`);
      return "`" + name + "`";
    })
    .replace(/<Fw\s*\/>/g, info.title)
    .replace(/<Pkg\s*\/>/g, info.package)
    .replace(/<InstallCommand\s*\/>/g, "```package-install\n" + `${info.package} @microsoft/signalr\n` + "```");
}

const written = new Set();

// Unchanged files keep their timestamp, so a watching dev server does not rebuild them.
function write(file, text) {
  written.add(path.resolve(file));
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === text) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (let attempt = 0; ; attempt++) {
    try {
      fs.writeFileSync(file, text);
      return;
    } catch (error) {
      // Windows locks a file for a moment while a dev server reads it.
      if (error.code !== "EPERM" || attempt === 20) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
}

// Deletes files from an earlier run one by one; Windows denies removing a folder that a dev server watches.
function removeStale(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      removeStale(full);
      if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
    } else if (!written.has(full)) {
      fs.rmSync(full, { force: true });
    }
  }
}

const sources = {};

function buildFolder(fw, sections, meta) {
  const missing = [];
  const rootPages = [];
  for (const section of sections) {
    const pages = section.folder ? section.pages.map((p) => `${section.folder}/${p}`) : section.pages;
    if (section.folder) {
      rootPages.push(section.folder);
      write(path.join(out, fw, section.folder, "meta.json"),
        JSON.stringify({ title: section.title, icon: section.icon, defaultOpen: true, pages: section.pages }, null, 2));
    } else {
      rootPages.push(...pages);
    }
    for (const page of pages) {
      const from = [path.join(src, fw, `${page}.mdx`), path.join(src, "shared", `${page}.mdx`)].find((f) => fs.existsSync(f));
      if (!from) { missing.push(page); continue; }
      sources[`${fw}/${page}.mdx`] = path.relative(root, from).replaceAll(path.sep, "/");
      const text = transform(fs.readFileSync(from, "utf8"), fw, path.relative(root, from));
      // A nested <Only> leaves a stray tag behind, which would render as text.
      if (/<\/?Only[\s>]/.test(text)) throw new Error(`${path.relative(root, from)}: nested or unclosed <Only> for ${fw}`);
      write(path.join(out, fw, `${page}.mdx`), text);
    }
  }
  write(path.join(out, fw, "meta.json"), JSON.stringify({ ...meta, root: true, pages: rootPages }, null, 2));
  return missing.map((p) => `${fw}/${p}`);
}

function generate() {
  written.clear();
  for (const key of Object.keys(sources)) delete sources[key];
  const missing = [];
  for (const fw of order) {
    const f = frameworks[fw];
    missing.push(...buildFolder(fw, nav.framework, { title: f.title, description: f.package, icon: `si:${f.icon}` }));
  }
  missing.push(...buildFolder("core", nav.core, { title: core.title, description: core.description, icon: core.icon }));
  write(path.join(out, "meta.json"), JSON.stringify({ pages: [...order, "core"] }, null, 2));
  write(outArg > 0 ? path.join(out, "sources.json") : path.join(root, "content/sources.json"), JSON.stringify(sources, null, 2));
  removeStale(out);
  if (missing.length) {
    const msg = `${missing.length} pages without a source, for example ${missing.slice(0, 3).join(", ")}`;
    if (strict) throw new Error(msg);
    console.warn(msg);
  }
}

generate();

if (process.argv.includes("--watch")) {
  let timer;
  for (const dir of [src, snippets, path.join(root, "content/frameworks.json")]) {
    fs.watch(dir, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try { generate(); } catch (error) { console.error(error.message); }
      }, 150);
    });
  }
  spawn("next", ["dev"], { cwd: root, stdio: "inherit", shell: true });
}
