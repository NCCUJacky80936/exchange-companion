import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

function isValidDate(value) {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidTimeZone(value) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function validateProfile(profile, options = {}) {
  const errors = [];
  const requiredStrings = [
    "appName",
    "ownerName",
    "homeCity",
    "homeCountry",
    "homeTimeZone",
    "hostCity",
    "hostCountry",
    "hostTimeZone",
    "hostSchool",
    "program",
    "language",
  ];

  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return ["設定必須是一個 JSON object。"];
  }
  if (profile.schemaVersion !== 1) errors.push("schemaVersion 必須是 1。");
  for (const key of requiredStrings) {
    if (typeof profile[key] !== "string" || !profile[key].trim()) errors.push(`${key} 不可空白。`);
  }
  if (!COUNTRY_CODE_PATTERN.test(profile.hostCountryCode ?? "")) errors.push("hostCountryCode 必須是兩碼大寫國家代碼。");
  if (!CURRENCY_PATTERN.test(profile.primaryCurrency ?? "")) errors.push("primaryCurrency 必須是三碼大寫幣別。");
  if (!CURRENCY_PATTERN.test(profile.secondaryCurrency ?? "")) errors.push("secondaryCurrency 必須是三碼大寫幣別。");
  for (const key of ["homeTimeZone", "hostTimeZone"]) {
    if (typeof profile[key] === "string" && !isValidTimeZone(profile[key])) errors.push(`${key} 不是有效的 IANA 時區。`);
  }
  for (const key of ["startDate", "endDate"]) {
    if (!isValidDate(profile[key] ?? "")) errors.push(`${key} 必須是有效的 YYYY-MM-DD 日期。`);
  }
  if (profile.orientationDate && !isValidDate(profile.orientationDate)) errors.push("orientationDate 必須留空或使用有效的 YYYY-MM-DD 日期。");
  if (isValidDate(profile.startDate ?? "") && isValidDate(profile.endDate ?? "") && profile.endDate < profile.startDate) {
    errors.push("endDate 不可早於 startDate。");
  }
  if (!profile.visual || typeof profile.visual !== "object") {
    errors.push("visual 設定不可缺少。");
  } else {
    for (const key of ["routeLabel", "heroImage", "socialImage", "icon"]) {
      if (typeof profile.visual[key] !== "string" || !profile.visual[key].trim()) errors.push(`visual.${key} 不可空白。`);
    }
    for (const key of ["heroImage", "socialImage", "icon"]) {
      if (typeof profile.visual[key] === "string" && !profile.visual[key].startsWith("/")) errors.push(`visual.${key} 必須是 public/ 下的絕對網址路徑。`);
      if (options.checkAssets !== false && typeof profile.visual[key] === "string" && profile.visual[key].startsWith("/") && !existsSync(resolve("public", `.${profile.visual[key]}`))) errors.push(`visual.${key} 找不到對應的 public 資產。`);
    }
    if (!profile.visual.generatedFor || profile.visual.generatedFor.homeCity !== profile.homeCity || profile.visual.generatedFor.hostCity !== profile.hostCity) errors.push("visual.generatedFor 必須與目前的 homeCity／hostCity 一致，避免沿用其他目的地的圖片。");
  }
  if (!profile.research || typeof profile.research !== "object") {
    errors.push("research 設定不可缺少。");
  } else {
    if (!isValidDate(profile.research.minimumVerifiedDate ?? "")) errors.push("research.minimumVerifiedDate 必須是有效日期。");
    if (!Array.isArray(profile.research.preferredOfficialDomains)) errors.push("research.preferredOfficialDomains 必須是陣列。");
  }
  return errors;
}

export async function readProfile(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
