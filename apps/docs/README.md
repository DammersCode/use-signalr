# use-signalr docs site

The documentation site: Next.js and Fumadocs. The landing page is `app/(home)/page.tsx`. The docs pages come from `content/src`.

## Commands

```bash
npm run dev -w apps/docs        # generate content, watch, and start next dev
npm run build -w apps/docs      # generate content (strict) and build
npm run typecheck -w apps/docs  # generate content and type-check the app
npm run snippets -w apps/docs   # type-check every code sample
```

## How content works

Write pages only in `content/src`. `scripts/gen-content.mjs` writes `content/docs` from it. `content/docs` is generated; do not edit it.

- `content/src/nav.json` sets the page order. `framework` is the tree for every framework folder. `core` is the tree for the Core folder.
- `content/src/shared/<path>.mdx` is a page that every framework gets.
- `content/src/<framework>/<path>.mdx` is a page for one framework. It replaces a shared page at the same path.
- `content/src/core/<path>.mdx` is a page for the Core folder. A Core page at a shared path replaces the shared page.
- `content/frameworks.json` holds the order of the framework select, the package names, and the API name of each concept per framework.

All framework folders have the same paths, so the framework select keeps the reader on the same page.

## Tags in shared pages

The generator replaces these tags with plain Markdown for each framework. The rendered page and its Markdown copy are the same.

| Tag | Result |
| --- | --- |
| `<Api of="invoke" />` | The framework's name for the concept, in code font, for example `useSignalRInvoke` or `hubInvoke`. Keys: `provider`, `context`, `keepAlive`, `event`, `invoke`, `send`, `teardown`, `status`, `reconnected`. |
| `<Snippet id="groups" />` | A code block from `snippets/<framework>/groups.*`. The generator looks in `snippets/<framework>`, then `snippets/shared`. Shared samples import from core; the generator shows the framework package instead. A missing snippet stops the build. |
| `<Snippet file="examples/server/Hubs/ChatHub.cs" />` | A code block from a repo file, path from the repo root. Use it for the server samples, so they come from the runnable example server. |
| `<Only in="vue,svelte">…</Only>` | The text appears only for the listed frameworks. |
| `<Only not="core">…</Only>` | The text appears for every folder except the listed ones. |
| `<Fw />`, `<Pkg />` | The framework title and its package name. |
| `<InstallCommand />` | An install block for the framework package with tabs for each package manager. |
| `<AutoTypeTable path="../../packages/core/src/types.ts" name="InvokeOptions" />` | A table of the properties of a type or interface, generated from its TypeScript source, with the type, default, and description from its JSDoc. The generator passes the tag through unchanged. It stops the build when the file at `path` (relative to `apps/docs`) does not exist, or does not export a type or interface with that `name`. Write the description and the `@default` of each property in the JSDoc. Copy Markdown, the `.md` routes, and `llms-full.txt` get the same table as Markdown. |

Put each tag on its own line, and do not nest `<Only>`.

## Code samples

Every sample is a real file under `snippets/<framework>/` and compiles in the gates (`npm run snippets`). A line with `// ---cut---` hides everything above it on the page, so imports and setup can stay in the file. `snippets/<framework>/client.ts` is the client module that the other samples import. The C# samples come from `examples/server` through `<Snippet file>`.

Write prose with the `simple-english` skill and follow the Docs rules in the root `AGENTS.md`.
