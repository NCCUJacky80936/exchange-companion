#!/usr/bin/env node
import { resolve } from "node:path";
import { readProfile, validateProfile } from "./lib/profile.mjs";

const target = resolve(process.argv[2] ?? "config/exchange-profile.json");

try {
  const profile = await readProfile(target);
  const errors = validateProfile(profile);
  if (errors.length) {
    console.error(`交換設定有 ${errors.length} 個問題：`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`交換設定有效：${profile.homeCity} → ${profile.hostCity}｜${profile.hostSchool}`);
  }
} catch (error) {
  console.error(`無法讀取交換設定：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
