import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packagesDir = path.join(rootDir, "packages");

const violations = [];

function readJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

// Collect every "import"/default target string in an exports map, however nested.
function collectEntries(exportsField) {
  const entries = [];
  const visit = (subpath, node) => {
    if (typeof node === "string") {
      entries.push({ subpath, file: node });
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      visit(key.startsWith(".") ? key : subpath, value);
    }
  };
  if (typeof exportsField === "string") {
    entries.push({ subpath: ".", file: exportsField });
  } else {
    visit(".", exportsField);
  }
  // Types targets are not importable at runtime.
  return entries.filter((e) => !e.file.endsWith(".d.ts"));
}

const packageDirs = readdirSync(packagesDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

for (const name of packageDirs) {
  const pkgPath = path.join(packagesDir, name, "package.json");
  if (!existsSync(pkgPath)) continue;
  const pkg = readJson(pkgPath);

  if (!pkg.exports) {
    violations.push(`packages/${name}/package.json has no "exports" map`);
    continue;
  }

  const entries = collectEntries(pkg.exports);
  if (entries.length === 0) {
    violations.push(`packages/${name}/package.json "exports" resolves to no runtime entry`);
  }

  const seen = new Set();
  for (const { subpath, file } of entries) {
    if (seen.has(file)) continue;
    seen.add(file);

    const abs = path.resolve(packagesDir, name, file);
    if (!existsSync(abs)) {
      violations.push(`${pkg.name} "${subpath}" -> ${file} does not exist (run npm run build first)`);
      continue;
    }
    try {
      const mod = await import(pathToFileURL(abs).href);
      if (Object.keys(mod).length === 0) {
        violations.push(`${pkg.name} "${subpath}" -> ${file} has no exports`);
      }
    } catch (err) {
      violations.push(`${pkg.name} "${subpath}" -> ${file} failed to import: ${err.message}`);
    }
  }
}

if (violations.length > 0) {
  console.error("check-dist failed:\n");
  for (const v of violations) console.error(`  - ${v}`);
  console.error(`\n${violations.length} violation(s).`);
  process.exit(1);
}

process.exit(0);
