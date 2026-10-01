import { docs } from "collections/server";
import { loader, type InferPageType } from "fumadocs-core/source";
import { icons } from "lucide-react";
import type { GeneratedDoc } from "fumadocs-typescript";
import { createElement } from "react";
import { BrandIcon } from "@/components/brand-icon";
import { docsContentRoute, docsRoute } from "./shared";
import { getTypeGenerator, typeTableOptions } from "./type-generator";

export const source = loader({
  baseUrl: docsRoute,
  source: docs.toFumadocsSource(),
  icon(name) {
    if (!name) return undefined;
    if (name.startsWith("si:")) return createElement(BrandIcon, { name: name.slice(3) });
    const Icon = icons[name as keyof typeof icons];
    return Icon ? createElement(Icon) : undefined;
  },
});

export type Page = InferPageType<typeof source>;

export function getPageMarkdownUrl(page: Page) {
  const segments = [...page.slugs, "content.md"];
  return { segments, url: `${docsContentRoute}/${segments.join("/")}` };
}

const AUTO_TYPE_TABLE = /<AutoTypeTable path="([^"]+)" name="([^"]+)"\s*\/>/g;

function cell(text: string) {
  return text.replaceAll("|", "\\|").replaceAll(/\s*\n\s*/g, " ");
}

function code(text: string) {
  return text.includes("`") ? `\`\` ${text} \`\`` : `\`${text}\``;
}

function typeTableMarkdown(doc: GeneratedDoc) {
  const rows = doc.entries.map((entry) => {
    const name = `\`${entry.name}${entry.required ? "" : "?"}\``;
    const type = code(cell(entry.simplifiedType));
    const fallback = entry.tags.find((tag) => tag.name === "default")?.text;
    return `| ${name} | ${type} | ${fallback ? code(cell(fallback)) : ""} | ${cell(entry.description)} |`;
  });
  return ["| Name | Type | Default | Description |", "| --- | --- | --- | --- |", ...rows].join("\n");
}

async function inlineComponents(markdown: string) {
  let out = markdown;
  for (const [tag, path, name] of markdown.matchAll(AUTO_TYPE_TABLE)) {
    const docs = await getTypeGenerator().generateTypeTable({ path, name }, typeTableOptions);
    out = out.replace(tag, docs.map(typeTableMarkdown).join("\n\n"));
  }
  return out;
}

export async function getLLMText(page: Page) {
  const processed = await inlineComponents(await page.data.getText("processed"));
  return `# ${page.data.title} (${page.url})\n\n${processed}`;
}
