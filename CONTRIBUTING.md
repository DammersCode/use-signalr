# 🤝 Contributing

Thanks for helping out! This package is small and dependency-free on purpose — keep it that way.

## 🧰 Prerequisites

- Node ≥ 18
- npm (or pnpm/yarn — examples use npm)

## 🏁 Run it locally

```bash
git clone https://github.com/DammersCode/use-signalr.git
cd use-signalr
npm install        # installs the dev deps (typescript, react, @microsoft/signalr, types)
```

This package has **no runtime dependencies** — `react`, `react-dom` and `@microsoft/signalr` are peer deps, pulled in by the consuming app. They're listed in `devDependencies` only so local type-checking and builds resolve.

## 🔨 Scripts

| Command | What it does |
| --- | --- |
| `npm run build` | Compiles `src/` → `dist/` with `.d.ts` declarations (`tsc -p tsconfig.json`). |
| `npm run typecheck` | Type-check without emitting. |

> The published package ships only the `dist/` folder (see `files` in `package.json`).

## 🗂️ Layout

```
src/
  index.ts                 # public entry — the only thing exported
  create-signalr-client.tsx# the factory
  config.ts                # hub-config resolution + connect-error rules
  retry.ts                 # invoke retry / backoff helpers
  status-store.ts          # external store for hub statuses
  types.ts                 # all public types
  internal-hooks.ts        # inlined useLatest (keeps the package self-contained)
  internal/                # provider, hooks, connection manager — not exported
```

## 🧪 Testing your change in a real app

The fastest loop is a local link:

```bash
npm run build
npm link                     # in this repo

cd ../my-app
npm link @dammers/use-signalr
```

Rebuild here after each change (`npm run build`) and the app picks it up. Unlink with `npm unlink @dammers/use-signalr` in the app when done.

## 📐 Ground rules

- **No new dependencies.** If a few lines can do it, write the few lines. Anything React/SignalR-related belongs in peer deps.
- **Stay self-contained.** No imports from outside `src/`. The `internal-hooks.ts` helper is inlined for exactly this reason.
- **Keep it typed.** Public APIs are inferred from the contract — avoid `any` and casts; the three existing casts are documented in code, don't add a fourth without a comment explaining why.
- **Match the surrounding style.** Same comment density and naming as the existing files.

## 🔀 Pull requests

1. Fork & branch (`feat/…`, `fix/…`).
2. `npm run build` and `npm run typecheck` must pass clean.
3. Update the [README](./README.md) if you changed the public API.
4. One focused change per PR — small diffs get merged fast.

## 🚀 Releasing

One command bumps the version, commits, tags, and pushes:

```bash
npm version patch   # 0.3.0 -> 0.3.1  (minor | major for features | breaking)
```

Tests and typecheck run first — a failure stops the release before anything is
tagged. The pushed tag triggers the GitHub Actions release workflow, which
publishes to npm and creates a GitHub Release.

Never edit `version` in `package.json` by hand. The workflow fails if the tag
and the file disagree.
