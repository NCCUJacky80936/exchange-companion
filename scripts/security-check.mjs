#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split("\n")
  .map((file) => file.trim())
  .filter(Boolean);

const read = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const issues = [];
const [worker, syncFunction, telegramFunction, sharedHttp, migrations, publicSource, supabaseConfig] = await Promise.all([
  read("worker/index.ts"),
  read("supabase/functions/exchange-concierge-sync/index.ts"),
  read("supabase/functions/telegram-concierge-webhook/index.ts"),
  read("supabase/functions/_shared/http.ts"),
  Promise.all(files.filter((file) => file.startsWith("supabase/migrations/") && file.endsWith(".sql")).map(read)).then((items) => items.join("\n")),
  Promise.all(files.filter((file) => /^(?:app|public|worker)\//.test(file) && /\.(?:js|mjs|ts|tsx|json|html)$/.test(file)).map(read)).then((items) => items.join("\n")),
  read("supabase/config.toml"),
]);

for (const header of ["Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy"]) {
  if (!worker.includes(header)) issues.push(`Worker 缺少 ${header}`);
}
if (/Access-Control-Allow-Origin["']?\s*[:=]\s*["']\*/.test(syncFunction)) issues.push("Concierge Edge Function 仍使用萬用 CORS");
if (!syncFunction.includes("readJsonBodyWithLimit")) issues.push("Concierge Edge Function 未在解析前限制 request body");
if (!syncFunction.includes("take_concierge_rate_limit")) issues.push("Concierge Edge Function 未啟用伺服器端 rate limit");
if (!sharedHttp.includes("request.body?.getReader()") || !sharedHttp.includes("reader.cancel(\"body_too_large\")")) {
  issues.push("Edge Function request body 未使用可提早中止的串流上限");
}
if (!telegramFunction.includes("jsonResponse") || !telegramFunction.includes("unsupported_media_type\" ? 415")) {
  issues.push("Telegram webhook 未共用安全 JSON 回應與 Content-Type 邊界");
}
const firstCleanup = syncFunction.indexOf("await cleanupExpiredProposalRuns()");
const authenticatedPull = syncFunction.indexOf('if (payload.action === "pull")');
const scopedProposals = syncFunction.indexOf('if (payload.action === "proposals")');
const secondCleanup = syncFunction.indexOf("await cleanupExpiredProposalRuns()", firstCleanup + 1);
if (firstCleanup < authenticatedPull || secondCleanup < scopedProposals) {
  issues.push("Concierge retention cleanup 可能在身分與 scope 驗證前寫入資料庫");
}
if (/(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEYS|TELEGRAM_BOT_TOKEN|TELEGRAM_WEBHOOK_SECRET)/.test(publicSource)) {
  issues.push("前端或公開資產出現僅限伺服器的 secret 名稱");
}

const createdTables = [...migrations.matchAll(/create\s+table(?:\s+if\s+not\s+exists)?\s+public\.([a-z0-9_]+)/gi)].map((match) => match[1]);
const rlsTables = new Set([...migrations.matchAll(/alter\s+table\s+public\.([a-z0-9_]+)\s+enable\s+row\s+level\s+security/gi)].map((match) => match[1]));
for (const table of createdTables) if (!rlsTables.has(table)) issues.push(`public.${table} 未啟用 RLS`);
if (!/alter default privileges[\s\S]*revoke execute on functions from public/i.test(migrations)) issues.push("新 public functions 尚未設成 deny-by-default");
if (!/minimum_password_length\s*=\s*(?:[89]|[1-9]\d+)/.test(supabaseConfig)
  || !/password_requirements\s*=\s*"letters_digits"/.test(supabaseConfig)
  || !/secure_password_change\s*=\s*true/.test(supabaseConfig)) {
  issues.push("Supabase Auth 的密碼基準未達 8 字元、英數組合與安全改密碼要求");
}
if (/allowed_cidrs(?:_v6)?\s*=\s*\[[^\]]*(?:0\.0\.0\.0\/0|::\/0)/.test(supabaseConfig)) {
  issues.push("Supabase database network baseline 仍允許所有來源");
}

if (issues.length) {
  console.error(`資安檢查未通過（${issues.length}）：`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log("程式碼資安基線通過：已驗證 secrets 邊界、RLS、CORS、輸入上限、rate limit 與網站安全標頭；正式環境仍需部署後實測。");
}
