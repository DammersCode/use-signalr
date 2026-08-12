import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const rootPkgPath = path.join(rootDir, "package.json");
const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf8"));
const version = rootPkg.version;

const SCOPE_PREFIX = "@dammers/use-signalr";
const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies"];

// Examples must pin the workspace version, or npm resolves registry copies.
const syncDeps = (pkg) => {
  for (const field of DEP_FIELDS) {
    for (const name of Object.keys(pkg[field] ?? {})) {
      if (name.startsWith(SCOPE_PREFIX)) pkg[field][name] = version;
    }
  }
};

for (const dir of ["packages", "examples"]) {
  const groupDir = path.join(rootDir, dir);
  if (!existsSync(groupDir)) continue;
  for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkgPath = path.join(groupDir, entry.name, "package.json");
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    } catch {
      continue;
    }

    if (dir === "packages") pkg.version = version;
    syncDeps(pkg);

    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
}
