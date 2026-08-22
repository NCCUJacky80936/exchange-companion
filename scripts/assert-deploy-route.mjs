import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const hostingPath = resolve(".openai/hosting.json");
let hosting;

try {
  hosting = JSON.parse(await readFile(hostingPath, "utf8"));
} catch (error) {
  if (error?.code === "ENOENT") process.exit(0);
  console.error(`Deployment route guard could not read ${hostingPath}.`);
  process.exit(1);
}

const hasSitesBinding = typeof hosting?.project_id === "string" && hosting.project_id.trim().length > 0;
if (!hasSitesBinding) process.exit(0);

if (process.env.ALLOW_CLOUDFLARE_WORKERS_DEPLOY === "1") {
  console.warn("Cloudflare Workers deployment override enabled explicitly for this command.");
  process.exit(0);
}

console.error("Cloudflare Workers deployment blocked: this repository has an existing Codex Sites project binding.");
console.error("Use the existing Sites project for normal production releases.");
console.error("Only an explicit Workers migration may set ALLOW_CLOUDFLARE_WORKERS_DEPLOY=1 for one command.");
process.exit(1);
