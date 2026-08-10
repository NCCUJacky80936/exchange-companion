#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split("\n")
  .map((file) => file.trim())
  .filter(Boolean);

const forbiddenNames = [
  /^credentials(?:\.[^.]+)?\.json$/i,
  /^token(?:_[^.]+)?\.json$/i,
  /^\.env(?:\..+)?$/i,
  /\.(?:pem|p12|pfx|key)$/i,
];
const forbiddenPaths = [/(?:^|\/)(?:passport|visa-document|bank-statement)(?:\/|$)/i, /護照|簽證文件|財力證明/];
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsb_secret_[A-Za-z0-9_-]{12,}\b/,
  /\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{20,}\b/,
  /\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/,
  /"project_id"\s*:\s*"appgprj_[^"]+"/,
  /https:\/\/exchange-companion-tw\.[^\s"']+\.chatgpt\.site/,
  /\/Users\/[A-Za-z0-9._-]+\//,
];
const textExtensions = new Set([".cjs", ".css", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".sql", ".toml", ".ts", ".tsx", ".txt", ".yaml", ".yml"]);
const issues = [];

for (const file of files) {
  const name = basename(file);
  if (name !== ".env.example" && forbiddenNames.some((pattern) => pattern.test(name))) issues.push(`${file}：疑似憑證或私鑰檔名`);
  if (forbiddenPaths.some((pattern) => pattern.test(file))) issues.push(`${file}：疑似私人證件路徑`);
  const extension = name.includes(".") ? `.${name.split(".").pop().toLowerCase()}` : "";
  if (!textExtensions.has(extension)) continue;
  let info;
  try {
    info = await stat(file);
  } catch (error) {
    if (error?.code === "ENOENT") continue;
    throw error;
  }
  if (info.size > 1_000_000) continue;
  const content = await readFile(file, "utf8");
  for (const pattern of secretPatterns) {
    if (pattern.test(content)) issues.push(`${file}：符合敏感資訊規則 ${pattern}`);
  }
}

if (issues.length) {
  console.error(`隱私檢查未通過（${issues.length}）：`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log(`隱私檢查通過：已檢查 ${files.length} 個可提交檔案，未發現憑證、私人文件或個人雲端綁定。`);
}
