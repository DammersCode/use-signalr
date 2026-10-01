// Copies each framework's hero snippet into the README code blocks between the hero markers.
// With --check it only reports README blocks that differ from the snippet.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const snippets = path.join(root, "apps/docs/snippets");
const check = process.argv.includes("--check");
const LANG = { ts: "ts", tsx: "tsx", svelte: "svelte", vue: "vue" };
const readmes = ["README.md", ...fs.readdirSync(path.join(root, "packages")).map((p) => `packages/${p}/README.md`)];
// Compare with LF line ends, so a Windows checkout with CRLF counts as in sync.
const lf = (text) => text.replace(/\r\n/g, "\n");

function hero(fw) {
  const file = fs.readdirSync(path.join(snippets, fw)).find((f) => f.startsWith("hero."));
  const code = lf(fs.readFileSync(path.join(snippets, fw, file), "utf8")).replace(/^[\s\S]*?\/\/ ---cut---.*\n/, "");
  return "```" + LANG[file.split(".").pop()] + "\n" + code.trimEnd() + "\n```";
}

const stale = [];
for (const rel of readmes) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) continue;
  const raw = fs.readFileSync(file, "utf8");
  const text = lf(raw);
  const next = text.replace(
    /(<!-- hero:(\w+):start -->)[\s\S]*?(<!-- hero:\2:end -->)/g,
    (_, start, fw, end) => `${start}\n${hero(fw)}\n${end}`,
  );
  if (next === text) continue;
  if (check) stale.push(rel);
  else fs.writeFileSync(file, raw.includes("\r\n") ? next.replace(/\n/g, "\r\n") : next);
}
if (stale.length) {
  console.error(`README examples differ from apps/docs/snippets/*/hero.*: ${stale.join(", ")}. Run node scripts/sync-readmes.mjs.`);
  process.exit(1);
}
