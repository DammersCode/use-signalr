import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packagesDir = path.join(rootDir, "packages");

const CORE_NAME = "@dammers/use-signalr-core";
const violations = [];

function readJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

function readText(p) {
  return readFileSync(p, "utf8");
}

// 1. Version sync: root === every packages/*/package.json === react/solid's core dep range.
const rootPkgPath = path.join(rootDir, "package.json");
const rootPkg = readJson(rootPkgPath);
const version = rootPkg.version;

const packageDirs = readdirSync(packagesDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

for (const name of packageDirs) {
  const pkgPath = path.join(packagesDir, name, "package.json");
  if (!existsSync(pkgPath)) continue;
  const pkg = readJson(pkgPath);
  if (pkg.version !== version) {
    violations.push(
      `Version mismatch: root package.json is ${version}, packages/${name}/package.json is ${pkg.version}`,
    );
  }
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const dep = pkg[field]?.[CORE_NAME];
    if (dep !== undefined && dep !== version) {
      violations.push(
        `Core dependency mismatch: packages/${name}/package.json ${field}["${CORE_NAME}"] is ${dep}, expected ${version}`,
      );
    }
  }
}

// 2. READMEs exist.
const requiredReadmes = [
  "packages/core/README.md",
  "packages/react/README.md",
  "packages/solid/README.md",
  "packages/svelte/README.md",
  "packages/angular/README.md",
  "packages/vue/README.md",
  "packages/preact/README.md",
  "packages/lit/README.md",
  "README.md",
  "CONTRIBUTING.md",
  "ARCHITECTURE.md",
];
for (const rel of requiredReadmes) {
  if (!existsSync(path.join(rootDir, rel))) {
    violations.push(`Missing required doc: ${rel}`);
  }
}

// 3 & 4. Stale-name / stale-path patterns.
const staleNamePatterns = [
  { re: /npm i(nstall)? (-D )?@dammers\/use-signalr(?![-\w])/, label: "old unsuffixed install command" },
  { re: /from ["']@dammers\/use-signalr["']/, label: "old unsuffixed import" },
];
const stalePathPatterns = [
  { re: /\]\(\.\/src\//, label: "pre-monorepo relative link to ./src/" },
  { re: /\bsrc\/internal\//, label: "pre-monorepo path src/internal/" },
];

// Files checked for stale-name patterns (CONTRIBUTING.md legitimately
// references the old name for the deprecation instruction).
const nameCheckedFiles = [
  "README.md",
  "packages/core/README.md",
  "packages/react/README.md",
  "packages/solid/README.md",
  "packages/svelte/README.md",
  "packages/angular/README.md",
  "packages/vue/README.md",
  "packages/preact/README.md",
  "packages/lit/README.md",
];
for (const rel of nameCheckedFiles) {
  const p = path.join(rootDir, rel);
  if (!existsSync(p)) continue;
  const text = readText(p);
  for (const { re, label } of staleNamePatterns) {
    if (re.test(text)) {
      violations.push(`Stale-name pattern (${label}) found in ${rel}`);
    }
  }
}

// All docs files are checked for stale-path patterns.
const pathCheckedFiles = [...nameCheckedFiles, "CONTRIBUTING.md"];
for (const rel of pathCheckedFiles) {
  const p = path.join(rootDir, rel);
  if (!existsSync(p)) continue;
  const text = readText(p);
  for (const { re, label } of stalePathPatterns) {
    if (re.test(text)) {
      violations.push(`Stale-path pattern (${label}) found in ${rel}`);
    }
  }
}

// 5. Package-name/description sanity.
const sanityChecks = [
  ["packages/react/README.md", "@dammers/use-signalr-react"],
  ["packages/solid/README.md", "@dammers/use-signalr-solid"],
  ["packages/svelte/README.md", "@dammers/use-signalr-svelte"],
  ["packages/angular/README.md", "@dammers/use-signalr-angular"],
  ["packages/vue/README.md", "@dammers/use-signalr-vue"],
  ["packages/preact/README.md", "@dammers/use-signalr-preact"],
  ["packages/lit/README.md", "@dammers/use-signalr-lit"],
  ["packages/core/README.md", "@dammers/use-signalr-core"],
];
for (const [rel, mustMention] of sanityChecks) {
  const p = path.join(rootDir, rel);
  if (!existsSync(p)) continue; // already reported as missing above
  const text = readText(p);
  if (!text.includes(mustMention)) {
    violations.push(`${rel} does not mention "${mustMention}"`);
  }
}

// 6. Every workspace package is published by the release workflow, and built
//    by the root build script. Guards against a new adapter being forgotten.
const releasePath = path.join(rootDir, ".github/workflows/release.yml");
if (existsSync(releasePath)) {
  const release = readText(releasePath);
  for (const name of packageDirs) {
    if (!release.includes(`npm publish -w packages/${name}`)) {
      violations.push(`release.yml does not publish packages/${name}`);
    }
  }
}
for (const name of packageDirs) {
  if (!rootPkg.scripts?.build?.includes(`-w packages/${name}`)) {
    violations.push(`Root build script does not build packages/${name}`);
  }
}

if (violations.length > 0) {
  console.error("check-docs failed:\n");
  for (const v of violations) console.error(`  - ${v}`);
  console.error(`\n${violations.length} violation(s).`);
  process.exit(1);
}

process.exit(0);
