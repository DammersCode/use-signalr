# Contributing

Thanks for helping out! This is a small, dependency-light monorepo on purpose — keep it that way.

## Prerequisites

- Node ≥ 22
- npm (workspaces-based; examples use npm)

## Run it locally

```bash
git clone https://github.com/DammersCode/use-signalr.git
cd use-signalr
npm install        # installs and links all three workspace packages
```

Core has no runtime dependencies. React and Solid depend on core plus their framework as a peer dependency (`react`/`react-dom`, or `solid-js`) and on `@microsoft/signalr` as a peer dependency in all three packages. Peers are listed in `devDependencies` too, so local type-checking and builds resolve without a consuming app.

## Layout

```
packages/
  core/     @dammers/use-signalr-core     framework-free: connection lifecycle, contracts, retry
  react/    @dammers/use-signalr-react    React provider + hooks
  solid/    @dammers/use-signalr-solid    SolidJS provider + hooks
scripts/
  sync-versions.mjs   writes the root version into every package + adapter->core dep
  check-docs.mjs      docs-staleness guard (see "Ground rules")
```

Each package has its own `src/`, `package.json`, `tsconfig.json`/`tsconfig.build.json`, and `vitest.config.ts`. Only `packages/core/src` may be imported by the adapters — they never reach into each other.

## Build order

Core has to build before the adapters, since they import its compiled `dist/` for both types and runtime. The root scripts handle this for you — you never need to build core manually before working on an adapter.

## Scripts

Run from the repo root:

| Command | What it does |
| --- | --- |
| `npm run build` | Builds core, then react, then solid (`tsc -p tsconfig.build.json` per package). |
| `npm run typecheck` | Builds core (adapters need its `dist` to resolve types), then type-checks every package with a `typecheck` script. |
| `npm test` | Builds core, then runs `vitest run` in every package with a `test` script. |
| `npm run check` | Runs `scripts/check-docs.mjs` — fails if versions drift or docs go stale. |

Inside one package (`npm run build -w packages/react`, etc.) works too, but core must already be built for react/solid to type-check or test cleanly.

## Testing your change in a real app

The fastest loop is a local link, from whichever package you're changing:

```bash
npm run build -w packages/react     # or packages/solid, packages/core
npm link -w packages/react          # in this repo

cd ../my-app
npm link @dammers/use-signalr-react
```

Rebuild the package here after each change and the app picks it up. Unlink with `npm unlink @dammers/use-signalr-react` in the app when done.

If your change touches core, rebuild core first — the adapter you linked resolves core through its own `node_modules`, which points at the workspace-linked `packages/core/dist`.

## Ground rules

- **No new runtime dependencies.** If a few lines can do it, write the few lines. Anything framework/SignalR-related belongs in peer deps.
- **Stay self-contained per package.** No imports across `packages/*/src` boundaries except an adapter importing from `@dammers/use-signalr-core`.
- **Keep it typed.** Public APIs are inferred from the contract — avoid `any` and casts; any existing cast is documented in code, don't add an undocumented one.
- **Match the surrounding style.** Same comment density and naming as the existing files, per package.
- **Parity policy.** A behavior change that lives entirely in `packages/core` lands there once and both adapters pick it up automatically. A behavior change that touches an adapter surface (a hook's options, the provider's props, a hook's return shape) must land in **both** `packages/react` and `packages/solid` in the same PR, with matching tests in both. Don't ship a hook improvement to one framework and leave the other behind.
- **Docs stay in sync.** `npm run check` enforces version sync across all `package.json` files and catches stale package-name/path references left over from the pre-monorepo layout. It runs in CI and in `preversion` — fix violations rather than working around them.

## Pull requests

1. Fork & branch (`feat/…`, `fix/…`).
2. `npm run typecheck && npm test && npm run build` must pass clean.
3. Update the relevant package README (and the root README, if the change is framework-neutral) if you changed a public API.
4. One focused change per PR — small diffs get merged fast. A cross-adapter parity change is one PR, not two.

## Releasing

All three packages are versioned in lockstep — one version number, always released together.

```bash
npm version patch   # 0.1.0 -> 0.1.1  (minor | major for features | breaking)
```

This runs, in order:

1. `preversion`: `npm run check && npm run typecheck && npm test` — a failure here stops the release before anything is tagged.
2. The root `version` bumps `package.json`, then `version` script runs `scripts/sync-versions.mjs`, which writes the new version into every `packages/*/package.json` and into react's and solid's dependency on `@dammers/use-signalr-core`, then stages those files.
3. A single `v*` tag is created and pushed (`postversion`).

The pushed tag triggers the GitHub Actions release workflow, which builds, tests, verifies the tag matches every package's version, and publishes all three packages to npm with provenance. Publishing authenticates through npm trusted publishing (OIDC) — no token to store or rotate.

Never edit `version` by hand in any `package.json`. The release workflow fails if the tag and any package's version disagree.

### First publish and Trusted Publisher setup

`npm publish` via OIDC only works once a package already exists on npm with a Trusted Publisher configured for it. Each of the three packages needs its own Trusted Publisher entry on npmjs.com, pointing at this repo's `release.yml` workflow. Until that's set up per package:

- The **first** publish of each of `@dammers/use-signalr-core`, `@dammers/use-signalr-react`, and `@dammers/use-signalr-solid` has to be done manually (`npm publish` from a maintainer's authenticated machine, from the built `packages/*/dist`).
- After each package's first manual publish, configure its Trusted Publisher entry on npmjs.com to point at `release.yml`. Every release after that flows through CI automatically.

### Deprecating the old package

After merging the monorepo split, run once as a maintainer action (not part of any script):

```bash
npm deprecate @dammers/use-signalr "Moved to @dammers/use-signalr-react"
```

This does not affect existing installs; it only marks the old package on npm so new installs see a warning pointing at the successor.
