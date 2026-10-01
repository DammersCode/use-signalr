import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import { metaSchema, pageSchema } from "fumadocs-core/source/schema";

export const docs = defineDocs({
  dir: "content/docs",
  docs: { schema: pageSchema, postprocess: { includeProcessedMarkdown: true } },
  meta: { schema: metaSchema },
});

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: { themes: { light: "github-light-high-contrast", dark: "github-dark" } },
  },
});
