#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { validateProfile } from "./lib/profile.mjs";

try { loadEnvFile(resolve(".env.local")); } catch { /* Local-only mode does not need this file. */ }

const checks = [];
const major = Number(process.versions.node.split(".")[0]);
checks.push({ label: `Node.js ${process.versions.node}`, ok: major >= 22, detail: "需要 Node.js 22.13 以上" });

try {
  const profile = JSON.parse(await readFile(resolve("config/exchange-profile.json"), "utf8"));
  const errors = validateProfile(profile);
  checks.push({ label: "交換設定", ok: errors.length === 0, detail: errors.join("；") || `${profile.homeCity} → ${profile.hostCity}` });
} catch (error) {
  checks.push({ label: "交換設定", ok: false, detail: error instanceof Error ? error.message : String(error) });
}

try {
  await access(resolve("node_modules"), constants.R_OK);
  checks.push({ label: "網站套件", ok: true, detail: "已安裝" });
} catch {
  checks.push({ label: "網站套件", ok: false, detail: "請先執行 npm install" });
}

const cloudConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
checks.push({ label: "免費雲端", ok: true, detail: cloudConfigured ? "已偵測公開連線設定" : "尚未設定；本機模式仍可完整使用" });

for (const check of checks) console.log(`${check.ok ? "✓" : "✗"} ${check.label}：${check.detail}`);
if (checks.some((check) => !check.ok)) process.exitCode = 1;
