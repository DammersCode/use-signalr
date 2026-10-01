# Contributing

Thanks for helping out! This is a small, dependency-light monorepo on purpose — keep it that way.

## Prerequisites

- Node ≥ 22
- npm (workspaces-based; examples use npm)

## Run it locally

```bash
git clone https://github.com/DammersCode/use-signalr.git
cd use-signalr
npm install        # installs and links all workspace packages
```

Core has no runtime dependencies. Each adapter depends on core, its framework peer, and `@microsoft/signalr`. Preact uses `preact` only and does not use `preact/compat`. Peers are also development dependencies for local checks.

## Layout

```text
packages/
  core/     @dammers/use-signalr-core     framework-free: connection lifecycle, contracts, retry
  react/    @dammers/use-signalr-react    React provider + hooks
  solid/    @dammers/use-signalr-solid    SolidJS provider + hooks
  svelte/   @dammers/use-signalr-svelte   Svelte provider + stores
  angular/  @dammers/use-signalr-angular  Angular provider + signals
  vue/      @dammers/use-signalr-vue      Vue plugin + composables
  preact/   @dammers/use-signalr-preact   Native Preact provider + hooks
  lit/      @dammers/use-signalr-lit      Lit Reactive Controllers
apps/
  docs/     the documentation site (Next.js and Fumadocs), see apps/docs/README.md
examples/   one runnable app per framework, plus the example server
scripts/
  sync-versions.mjs   writes the root version into every package + adapter->core dep
  check-docs.mjs      docs-staleness guard (see "Ground rules")
  sync-readmes.mjs    copies the hero snippets into the README examples
```

Each package has its own `src/`, `package.json`, `tsconfig.json`/`tsconfig.build.json`, and `vitest.config.ts`. Only `packages/core/src` may be imported by the adapters — they never reach into each other. The docs page [Build an adapter](https://use-signalr.vercel.app/docs/core/build-an-adapter) explains how responsibility splits between core and the adapters.

To add an adapter to this repo, also register it: add its build step to the root `build` script, add its publish step to `.github/workflows/release.yml`, add it to `requiredReadmes` in `scripts/check-docs.mjs`, and add it to `apps/docs/content/frameworks.json` with snippets under `apps/docs/snippets/<name>/`.

## Build order

Core has to build before the adapters, since they import its compiled `dist/` for both types and runtime. The root scripts handle this for you — you never need to build core manually before working on an adapter.

## Scripts

Run from the repo root:

| Command | What it does |
| --- | --- |
| `npm run build` | Builds core, then all adapter packages. |
| `npm run typecheck` | Builds all packages (adapters and the docs snippets need their `dist` to resolve types), then type-checks every workspace with a `typecheck` script. |
| `npm test` | Builds core, then runs `vitest run` in every package with a `test` script. |
| `npm run check` | Runs `scripts/check-docs.mjs` — fails if versions drift or docs go stale. |
| `npm run check:dist` | Checks the built packages: every export target exists, and no test file ships. |
| `npm run dev -w apps/docs` | Starts the documentation site with live content generation. |

Inside one package (`npm run build -w packages/lit`, for example) works too. Core must already be built before an adapter check.

## Testing your change in a real app

Use [yalc](https://github.com/wclr/yalc). It copies the built files into the app, so the app gets one copy of React and `@microsoft/signalr`:

1. `npm run build`, then `yalc publish --no-scripts` in each package you changed, core first.
2. In the app, add core together with the adapter: `yalc add @dammers/use-signalr-core @dammers/use-signalr-react`. With pnpm, also set `"pnpm": { "overrides": { "@dammers/use-signalr-core": "file:.yalc/@dammers/use-signalr-core" } }`, or the adapter resolves core from the registry.
3. After the next publish, run `yalc update` in the app.

## Adapter integration scenarios

Every adapter keeps these scenarios in its `integration.test.*`. The tests use the real provider and the real core session, and mock only `@microsoft/signalr`.

| ID | Scenario | Expected result |
| --- | --- | --- |
| S1 | Invoke at the earliest consumer point: mount effect, init, or constructor | The call resolves after the connect. |
| S2 | The server pushes an event in the same task as the connect | The handler gets it. |
| S3 | The server pushes an event right after an auto-reconnect | The handler gets it. |
| S4 | A reconnect callback throws | The status ends as `"connected"`. Events still arrive. |
| S5 | An unrelated reactive value changes, and `baseUrl`, `enabled`, and `connectionKey` stay equal | No rebuild. |
| S6 | `connectionKey` changes | One rebuild. The event handler gets events from the new connection. The reconnect callback runs once after the rebuild. |
| S7 | Unmount while an invoke waits for the connection | It rejects with `AbortError`. The server gets no invoke. |
| S8 | First connect | The status goes through `"connecting"` to `"connected"`. |
| S9 | Lazy hub | It connects with the first consumer. It stops after the last consumer plus `graceMs`. |

## Example apps

`examples/` holds small reference apps that run against a real SignalR
backend, one per framework. Use them to debug a package by hand, with plain
buttons and console output instead of a test runner. See
[DEVELOP.md](./DEVELOP.md) for setup, ports, and the console protocol. The docs link to these apps; they are not hosted.

## Ground rules

- **No new runtime dependencies.** If a few lines can do it, write the few lines. Anything framework/SignalR-related belongs in peer deps.
- **Stay self-contained per package.** No imports across `packages/*/src` boundaries except an adapter importing from `@dammers/use-signalr-core`.
- **Keep it typed.** Public APIs are inferred from the contract — avoid `any` and casts; any existing cast is documented in code, don't add an undocumented one.
- **Match the surrounding style.** Same comment density and naming as the existing files, per package.
- **Parity policy.** A core behavior change lands once and every adapter picks it up. An adapter API change must be reviewed for React, Solid, Svelte, Angular, Vue, Preact, and Lit parity, with matching tests where the API exists.
- **Docs stay in sync.** `npm run check` enforces version sync across all `package.json` files and catches stale package-name/path references left over from the pre-monorepo layout. It runs in CI and in `preversion` — fix violations rather than working around them.

## Pull requests

1. Fork & branch (`feat/…`, `fix/…`).
2. `npm run check && npm run typecheck && npm test && npm run build && npm run check:dist` must pass clean.
3. If you changed a public API, update the docs pages in `apps/docs/content/src` and their snippets.
4. One focused change per PR — small diffs get merged fast. A cross-adapter parity change is one PR, not two.

## Docs site

The documentation site lives in [`apps/docs`](./apps/docs). Its README explains how pages, framework tags, and type-checked snippets work. `npm run typecheck` also generates the pages and type-checks every snippet. The site deploys to Vercel with `apps/docs` as the root directory.

## Releasing

All packages are versioned in lockstep — one version number, always released together.

```bash
npm version patch   # 1.0.0 -> 1.0.1  (minor | major for features | breaking)
```

`npm version` runs, in order:

1. `preversion`: `npm run check && npm run typecheck && npm test` — a failure here stops the release before anything is tagged.
2. The root `version` bumps `package.json`, then `version` script runs `scripts/sync-versions.mjs`, which writes the new version into every `packages/*/package.json` and into each `@dammers/use-signalr-*` dependency. It also writes the pins in `examples/*/package.json`. Then it updates `package-lock.json` and stages these files.
3. A single `v*` tag is created and pushed (`postversion` pushes the branch and all tags).

The pushed tag triggers the GitHub Actions release workflow, which builds, tests, verifies the tag matches every package's version, and publishes all packages to npm with provenance. Publishing authenticates through npm trusted publishing (OIDC) — no token to store or rotate.

Do not edit `version` by hand in any single `package.json`. The release workflow fails if the tag and any package's version disagree. A full release gets the npm dist-tag `latest`.

### First publish and Trusted Publisher setup

`npm publish` via OIDC only works once a package already exists on npm with a Trusted Publisher configured for it. Each package needs its own Trusted Publisher entry on npmjs.com, pointing at this repo's `release.yml` workflow. Until that's set up per package:

- A new package needs its first publish by hand, from a maintainer's authenticated machine.
- After that first publish, configure its Trusted Publisher entry on npmjs.com to point at `release.yml`. Every release after that flows through CI automatically.

All 8 packages exist on npm. Before a release, check that each one has its Trusted Publisher entry.
