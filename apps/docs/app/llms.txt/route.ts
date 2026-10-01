import { llms } from "fumadocs-core/source";
import { siteUrl } from "@/lib/shared";
import { source } from "@/lib/source";

export const revalidate = false;

export async function GET() {
  const index = (await llms(source).index()).replace(/\]\((\/docs\/[^)]+)\)/g, `](${siteUrl}$1.md)`);
  return new Response(index);
}
