#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";

const root = resolve(".agents/skills");
const entries = await readdir(root, { withFileTypes: true });
const issues = [];
let count = 0;

async function filesUnder(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(path));
    else result.push(path);
  }
  return result;
}

for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  count += 1;
  const skillPath = resolve(root, entry.name, "SKILL.md");
  const yamlPath = resolve(root, entry.name, "agents/openai.yaml");
  try {
    const skill = await readFile(skillPath, "utf8");
    const header = skill.match(/^---\n([\s\S]*?)\n---/);
    if (!header) {
      issues.push(`${entry.name}：SKILL.md 缺少 YAML frontmatter`);
    } else {
      const keys = [...header[1].matchAll(/^([a-zA-Z0-9_-]+):/gm)].map((match) => match[1]);
      if (keys.join(",") !== "name,description") issues.push(`${entry.name}：frontmatter 只能依序包含 name 與 description`);
      if (!header[1].includes(`name: ${entry.name}`)) issues.push(`${entry.name}：name 必須與資料夾相同`);
    }
    if (skill.length > 40_000) issues.push(`${entry.name}：SKILL.md 過長，請把細節移到 references`);
  } catch (error) {
    issues.push(`${entry.name}：無法讀取 SKILL.md（${error instanceof Error ? error.message : String(error)}）`);
  }
  try {
    const yaml = await readFile(yamlPath, "utf8");
    if (!yaml.includes(`$${entry.name}`)) issues.push(`${entry.name}：default_prompt 必須明確提到 $${entry.name}`);
  } catch (error) {
    issues.push(`${entry.name}：無法讀取 agents/openai.yaml（${error instanceof Error ? error.message : String(error)}）`);
  }
  for (const file of await filesUnder(resolve(root, entry.name))) {
    if (extname(file) === ".json") {
      try { JSON.parse(await readFile(file, "utf8")); } catch { issues.push(`${entry.name}：${file.slice(root.length + 1)} 不是有效 JSON`); }
    }
    if (extname(file) !== ".md") continue;
    const markdown = await readFile(file, "utf8");
    for (const match of markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1].split("#")[0];
      if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
      if (!existsSync(resolve(dirname(file), target))) issues.push(`${entry.name}：${file.slice(root.length + 1)} 連結的 ${target} 不存在`);
    }
  }
}

if (!count) issues.push("沒有找到任何專案 Skill");
if (issues.length) {
  console.error(`Skill 檢查未通過（${issues.length}）：`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log(`Skill 檢查通過：${count} 個專案 Skill 可隨 repository 使用。`);
}
