// Type-checks every snippets/<framework> folder with the checker that fits its file types.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "snippets");
const checkers = {
  svelte: (d) => `svelte-check --workspace "${d}" --tsconfig "${path.join(d, "tsconfig.json")}" --fail-on-warnings`,
  vue: (d) => `vue-tsc --noEmit -p "${path.join(d, "tsconfig.json")}"`,
};

let failed = false;
for (const name of fs.readdirSync(dir)) {
  const d = path.join(dir, name);
  if (!fs.existsSync(path.join(d, "tsconfig.json"))) continue;
  const cmd = (checkers[name] ?? ((x) => `tsc --noEmit -p "${path.join(x, "tsconfig.json")}"`))(d);
  try {
    execSync(cmd, { stdio: "inherit", cwd: root });
    console.log(`snippets/${name}: ok`);
  } catch {
    failed = true;
    console.error(`snippets/${name}: failed`);
  }
}
if (failed) process.exit(1);
