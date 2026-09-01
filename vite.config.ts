import vinext from "vinext";
import { defineConfig } from "vite";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sites } from "./build/sites-vite-plugin.ts";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

type HostingBindings = {
  d1?: string;
  r2?: string;
};

function readHostingBindings(): HostingBindings {
  const configPath = resolve(
    process.env.SITES_HOSTING_CONFIG_PATH ?? ".openai/hosting.json",
  );

  // A personal Sites binding is deliberately gitignored. Public template
  // checkouts must still build without inheriting the original site owner.
  if (!existsSync(configPath)) return {};

  const parsed: unknown = JSON.parse(readFileSync(configPath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(".openai/hosting.json must contain a JSON object");
  }

  const { d1, r2 } = parsed as Record<string, unknown>;
  if (d1 !== undefined && d1 !== null && typeof d1 !== "string") {
    throw new Error(".openai/hosting.json d1 must be a string");
  }
  if (r2 !== undefined && r2 !== null && typeof r2 !== "string") {
    throw new Error(".openai/hosting.json r2 must be a string");
  }

  return {
    d1: typeof d1 === "string" ? d1.trim() || undefined : undefined,
    r2: typeof r2 === "string" ? r2.trim() || undefined : undefined,
  };
}

const { d1, r2 } = readHostingBindings();

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  assets: {
    binding: "ASSETS",
    run_worker_first: ["/_next/static/*", "/icons/*", "/images/*"],
  },
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
