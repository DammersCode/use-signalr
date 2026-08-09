import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packagesDir = path.join(rootDir, "packages");

const rootPkgPath = path.join(rootDir, "package.json");
const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf8"));
const version = rootPkg.version;

const CORE_NAME = "@dammers/use-signalr-core";
const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies"];

for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const pkgPath = path.join(packagesDir, entry.name, "package.json");
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  } catch {
    continue;
  }

  pkg.version = version;
  for (const field of DEP_FIELDS) {
    if (pkg[field]?.[CORE_NAME] !== undefined) {
      pkg[field][CORE_NAME] = version;
    }
  }

  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}
