# Developing with the example apps

The `examples/` apps connect to a real backend, so you can debug the built
packages by hand instead of by reading tests. This document covers setup,
ports, and the console protocol each app follows.

## Prerequisites

- Node 22 or later
- npm
- .NET SDK 10 (`global.json` pins the exact version)

## Build the packages first

The example apps import the BUILT `dist/` of each package, through its real
`exports` map, not the source. Build before you run an app:

```bash
npm run build
```

Rebuild a package after you change its source, then reload the app:

```bash
npm run build -w packages/react
```

Vite picks up the new `dist/` on the next page load. No app restart is
needed.

## Start everything

```bash
npm run dev
```

This starts the example server and every example app.

## Start only what you need

```bash
node scripts/dev.mjs react vue
```

Pass any mix of app names. Pass `server` alone to start only the backend.
With no arguments, `npm run dev` starts the server and all apps.

The command prints a URL for each app it starts, once, after the apps come
up. Each app's own log lines carry a `[name]` prefix.

## Ports

| App | Port |
| --- | --- |
| server | 5299 |
| react | 5301 |
| solid | 5302 |
| svelte | 5303 |
| angular | 5304 |
| vue | 5305 |
| preact | 5306 |
| lit | 5307 |

## What each button proves

Open the browser console (F12) before you click. Every log line starts with
`[use-signalr:<framework>]`, for example `[use-signalr:react]`.

| Button | What it proves | Console lines to expect |
| --- | --- | --- |
| Echo | A basic invoke round-trip | `echo -> hello` |
| Add(2,3) | Typed args and a typed return value | `add -> 5` |
| SlowEcho(2s) | An invoke that waits on the server | `slowEcho -> slow` after 2 s |
| Fail | A retried invoke against a business error | `invoke failed: attempts=1 retriable=false` |
| Ping | A fire-and-forget send, plus the resulting broadcast | `ping sent: true`, then `echoed ping at ...` |
| Leave | A fire-and-forget send that the server echoes back | `leave sent: true`, then `left <connectionId>` |
| Kill | A server-forced disconnect | `kill sent: true`, then `status /hubs/chat: disconnected` |
| ConnectionId | An invoke that reads server-side state | `connectionId -> <id>` |
| Toggle counter | A lazy hub: connect on mount, teardown on unmount | `status /hubs/counter: connected`, then `count <n>`, then `left <connectionId>` on unmount |

Independent of any button:

- `status /hubs/chat: connected` logs on every status change for the chat hub.
- `tick <n>` logs once a second, pushed by the server.
- `count <n>` logs every 2 s, only while the counter hub is connected.
- `token read #<n>` logs on every negotiate, proving the token factory runs
  per connection attempt, not once at startup.
- `reconnected` logs after the client reconnects, not after the first
  connect.

## Test a reconnect

`KillConnection` closes the connection cleanly. SignalR does not start an
automatic reconnect after a clean close. To see a real reconnect, restart
the server while an app runs:

1. Start the server alone: `node scripts/dev.mjs server`.
2. Start one app in a second terminal: `npm run dev -w examples/react`.
3. Open the app and wait for `status /hubs/chat: connected`.
4. Stop the server with Ctrl+C. The console shows `status /hubs/chat: reconnecting`.
5. Start the server again within 30 seconds. The console shows `reconnected`.

## Backend

`examples/server` is a minimal ASP.NET Core app with two hubs:

- `/hubs/chat`: request/response methods (`Echo`, `Add`, `SlowEcho`, `Fail`,
  `ConnectionId`) and fire-and-forget methods (`Ping`, `Leave`,
  `KillConnection`). Broadcasts `Tick` every second.
- `/hubs/counter`: a lazy hub. Broadcasts `Count` every 2 s. `Reset` sets the
  counter back to zero.

Run it alone with `dotnet run --project examples/server`, or through
`npm run dev` / `scripts/dev.mjs`.

## Shared contract

`examples/shared` (`@examples/contract`) declares the hub contract once, so
every framework app uses the same event and method names, and the same
`BASE_URL`. Each app imports it instead of redeclaring the contract.

## Example app layout

`examples/react` is the reference pattern. Each framework app that follows
it keeps the same shape:

```text
examples/react/
  index.html          entry HTML, loads src/main.tsx
  vite.config.ts       fixed port, strictPort: true
  tsconfig.json         noEmit, no test/typecheck script
  package.json          private: true, depends on the adapter at the workspace version
  src/
    client.ts           createSignalRClient(...) with the shared contract
    main.tsx             mounts the app
    App.tsx               provider, buttons, status/tick/count logging
    Counter.tsx            lazy /hubs/counter child, teardown on unmount
```

## Example apps do not run the test/typecheck gates

Example apps have no `test` or `typecheck` script. The root
`npm run typecheck` and `npm test` use `--workspaces --if-present`, so an
example app that added either script would run in CI by mistake. Verify an
app's types with `npx tsc --noEmit` (or `npx vue-tsc --noEmit` for Vue) run
directly inside the app's folder.
