#!/usr/bin/env node
import { access, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { validateProfile } from "./lib/profile.mjs";

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function loadJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function ask(rl, label, current) {
  const answer = (await rl.question(`${label} [${current}]：`)).trim();
  return answer || current;
}

const sourcePath = resolve(option("--profile") ?? "config/exchange-profile.json");
const outputPath = resolve(option("--output") ?? "config/exchange-profile.json");
const nonInteractive = process.argv.includes("--non-interactive") || Boolean(option("--profile"));

try {
  await access(sourcePath, constants.R_OK);
  const source = await loadJson(sourcePath);
  let profile = structuredClone(source);
  const originalRoute = `${profile.homeCity} → ${profile.hostCity}`;

  if (!nonInteractive) {
    const rl = createInterface({ input: stdin, output: stdout });
    console.log("\n建立你的交換手帳。直接按 Enter 會保留中括號內的值。\n");
    profile.appName = await ask(rl, "網站名稱", profile.appName);
    profile.ownerName = await ask(rl, "顯示名稱", profile.ownerName);
    profile.homeCity = await ask(rl, "出發城市（英文或當地語言）", profile.homeCity);
    profile.homeCountry = await ask(rl, "出發國家", profile.homeCountry);
    profile.homeTimeZone = await ask(rl, "出發地 IANA 時區", profile.homeTimeZone);
    profile.hostCountry = await ask(rl, "交換國家", profile.hostCountry);
    profile.hostCountryCode = (await ask(rl, "交換國家兩碼代碼", profile.hostCountryCode)).toUpperCase();
    profile.hostCity = await ask(rl, "交換城市", profile.hostCity);
    profile.hostTimeZone = await ask(rl, "交換地 IANA 時區", profile.hostTimeZone);
    profile.hostSchool = await ask(rl, "交換學校正式名稱", profile.hostSchool);
    profile.program = await ask(rl, "交換計畫／系所", profile.program);
    profile.startDate = await ask(rl, "交換開始日 YYYY-MM-DD", profile.startDate);
    profile.endDate = await ask(rl, "交換結束日 YYYY-MM-DD", profile.endDate);
    const orientationDate = await ask(rl, "Orientation 日期 YYYY-MM-DD（未知請輸入 -）", profile.orientationDate || "-");
    profile.orientationDate = orientationDate === "-" ? "" : orientationDate;
    profile.primaryCurrency = (await ask(rl, "目的地主要幣別", profile.primaryCurrency)).toUpperCase();
    profile.secondaryCurrency = (await ask(rl, "備用／本國幣別", profile.secondaryCurrency)).toUpperCase();
    profile.visual.routeLabel = `${profile.homeCity} → ${profile.hostCity}`;
    if (profile.visual.routeLabel !== originalRoute) {
      profile.visual.heroImage = "/images/exchange-hero-placeholder.svg";
      profile.visual.socialImage = "/images/exchange-social-placeholder.svg";
    }
    profile.visual.generatedFor = { homeCity: profile.homeCity, hostCity: profile.hostCity };
    await rl.close();
  }

  const errors = validateProfile(profile);
  if (errors.length) {
    console.error("設定尚未寫入：");
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    await writeFile(outputPath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
    console.log(`已建立交換設定：${profile.homeCity} → ${profile.hostCity}`);
    console.log(`下一步：執行 npm run doctor，再請 Codex 使用 $create-exchange-companion 完成研究、製圖與內容匯入。`);
  }
} catch (error) {
  console.error(`初始化失敗：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
