import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Turns "## Unreleased" into "## <version>" and opens a new empty "## Unreleased" above it.
const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const version = process.argv[2] ?? JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8")).version;
const file = process.argv[3] ?? path.join(rootDir, "CHANGELOG.md");

const text = readFileSync(file, "utf8");
const eol = text.includes("\r\n") ? "\r\n" : "\n";
const heading = /^## Unreleased[ \t]*\r?\n/m;
if (!heading.test(text)) {
  console.error(`CHANGELOG.md has no "## Unreleased" heading to stamp as ${version}.`);
  process.exit(1);
}
if (new RegExp(`^## ${version.replaceAll(".", "\.")}\s*$`, "m").test(text)) {
  console.error(`CHANGELOG.md already has a "## ${version}" section.`);
  process.exit(1);
}
const section = text.slice(text.search(heading)).split(/^## /m)[1] ?? "";
if (!/\S/.test(section.split(/\r?\n/).slice(1).join("\n"))) {
  console.error('The "## Unreleased" section is empty. Add the user-facing changes first.');
  process.exit(1);
}
writeFileSync(file, text.replace(heading, `## Unreleased${eol}${eol}## ${version}${eol}`));
