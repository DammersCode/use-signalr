# Agent rules for use-signalr

## Language

Everything in this repo is written in English: code, comments, docs, plans, commit messages, and PR text. Write new content in English; translate content found in another language.

## Package boundaries

- `@dammers/use-signalr-core` owns all connection behavior: sessions, ref counts, recovery, the event registry, invoke/send/teardown. It has no framework dependency.
- The 7 adapters (React, Preact, Solid, Svelte, Vue, Angular, Lit) are thin glue. They import only from core, never from each other. A behavior change lands once in core; every adapter picks it up.
- An adapter binds the session to its framework lifecycle: `session.update({ baseUrl, enabled, connectionKey })` on a value change, `session.stop()` on teardown, `context.subscribe` for events, `acquire`/`release` per consumer. `apps/docs/content/src/core/build-an-adapter.mdx` has the contract and the naming table.
- The public API is what each package's `src/index.ts` exports, plus the JSDoc on the members in `src/create-signalr-client.ts(x)`. Users see only that JSDoc in their editor.
- An adapter API change ships for all 7 adapters together, with matching tests (parity).

## Code

- Write a comment only when the code cannot say it: a constraint outside the code, a workaround for an external bug, or a deliberate simplification and its ceiling. One idea, one line, at most 25 words, active voice, condition first.
- Delete instead of writing: restatements of the next line, history, references to plans or finding IDs, commented-out code.
- Write JSDoc and comments with the `simple-english` skill.
- Types flow from the contract (`event()`, `method()`). Keep the code free of `any` and unchecked casts. Accepted exceptions: the `EventArgs` cast at the event boundary, the `any` constraints of the contract types in core `types.ts`, the phantom casts in `event()` and `method()`, the `Object.keys` cast in `hubKeys`, and the `args as unknown[]` casts where calls reach SignalR.
- Keep runtime dependencies at zero. Framework and SignalR packages are peers.

## Tests

- Write the failing test first and watch it fail. Then fix.
- Prove each new test with a mutation: revert the fix, the test goes red; restore it.
- Adapter tests read core from `packages/core/dist`. After a core change, build core before adapter tests (`npm test` does it).
- Every adapter keeps the integration scenarios S1 to S9 (`CONTRIBUTING.md`, "Adapter integration scenarios") in its `integration.test.*`, against the real core session with only `@microsoft/signalr` mocked.
- Peer floors in `package.json` are the lowest versions the CI `floor` job proves. Raise a floor only with a failing run as evidence.
- The CI `compat` job tests the newest release of each supported major that the lockfile does not cover. Widen a peer range only together with a `compat` entry for the new major.

## Workflow

### Gates

All green before committing:

```bash
npm run check && npm run typecheck && npm test && npm run build && npm run check:dist
```

### Commits and pushes

- Conventional prefixes (`feat:`, `fix:`, `docs:`, `test:`, `build:`, `ci:`, `chore:`), imperative subject.
- Commits, code, comments, docs, and plans credit people only. They never name an AI tool or model.
- The same text stays generic about where the library was tried: write "a sample app", never the name of a private or internal project.
- Push, tag, publish, and run `npm version` only when the owner asks. `npm version` pushes the branch and all tags through `postversion`.

### Changelog

A user-facing change gets an entry under `## Unreleased` in `CHANGELOG.md` in the same commit.

### Parallel agents

When several agents share one working tree:

- Each agent owns a fixed list of files and edits only those.
- One agent builds core. The others run only per-package `vitest` and `tsc`.
- Back up files only in a private scratchpad folder per agent (`<scratchpad>/<task-id>/`). Generic names in a shared folder collide.
- Read-only git only. The orchestrator commits with path-limited `git add`.

## Environment (Windows dev machine)

- `vitest` from Git Bash fails with `Cannot read properties of undefined (reading 'config')` when the path uses a lowercase drive. Use `C:/repos/...`, PowerShell, or `npm test`.
- Root-level `npx vitest` has no per-package environment. Use `npm test` or run `vitest` inside a package.

## Testing in a real app

Use `yalc` to test unpublished changes in another app:

1. `npm run build`, then `yalc publish --no-scripts` in each package, core first.
2. In the app, add core together with the adapter: `yalc add @dammers/use-signalr-core @dammers/use-signalr-react`. With pnpm, also set `"pnpm": { "overrides": { "@dammers/use-signalr-core": "file:.yalc/@dammers/use-signalr-core" } }`, or the adapter resolves core from the registry.
3. After a new publish: `yalc update` in the app.

## Docs

The docs site in `apps/docs` is the only full documentation. READMEs stay short and link to it. `apps/docs/README.md` explains pages, tags, and snippets. The README examples come from `apps/docs/snippets/*/hero.*`; run `node scripts/sync-readmes.mjs` after a change.

Write docs prose with the `simple-english` skill and run its self-check before you deliver.

The reader is external. They never saw our plans or our alternatives:

- State what a feature does, never how its shape was decided.
- Timeless: no "now", "new", "currently", "soon". `CHANGELOG.md` is the place for "new".
- Introduce a code sample with one sentence that ends in a colon. Every sample compiles against the current API.
- Numbered lists only when order matters. Never a one-item list.

## Skills

Repo-local skills live in `.agents/skills/`:

- `simple-english`: all docs prose, JSDoc, and code comments.
