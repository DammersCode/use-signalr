// Starts the example server plus the requested example apps, prefixing each
// child's output with its name. Usage: node scripts/dev.mjs [names...]
// No args starts the server and every app. "server" alone starts only the server.
import { spawn } from "node:child_process";

const ALL_APPS = ["react", "solid", "svelte", "angular", "vue", "preact", "lit"];

const requested = process.argv.slice(2);
const names = requested.length > 0 ? requested : ["server", ...ALL_APPS];
const wantServer = names.includes("server");
const wantApps = names.filter((n) => n !== "server");

for (const name of wantApps) {
  if (!ALL_APPS.includes(name)) {
    console.error(`Unknown app "${name}". Valid: server, ${ALL_APPS.join(", ")}`);
    process.exit(1);
  }
}

const children = [];

function prefix(name, chunk) {
  const lines = chunk.toString().split(/\r?\n/);
  for (const line of lines) {
    if (line.length > 0) process.stdout.write(`[${name}] ${line}\n`);
  }
}

function spawnChild(name, command, args) {
  const child = spawn(command, args, { shell: true });
  child.stdout.on("data", (d) => prefix(name, d));
  child.stderr.on("data", (d) => prefix(name, d));
  child.on("exit", (code) => prefix(name, `exited with code ${code}`));
  children.push(child);
}

if (wantServer) spawnChild("server", "dotnet", ["run", "--project", "examples/server"]);
for (const name of wantApps) {
  spawnChild(name, "npm", ["run", "dev", "-w", `examples/${name}`]);
}

if (children.length === 0) {
  console.error("Nothing to start.");
  process.exit(1);
}

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    child.kill();
    // Windows: shell:true spawns cmd.exe, whose child survives a plain kill.
    if (process.platform === "win32" && child.pid) {
      spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { shell: true });
    }
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", shutdown);
