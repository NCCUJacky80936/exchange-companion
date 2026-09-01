import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(new URL("../app/components/ExchangeCompanion.tsx", import.meta.url), "utf8");
const welcome = await readFile(new URL("../app/components/PublicWelcome.tsx", import.meta.url), "utf8");
const storage = await readFile(new URL("../app/lib/storage.ts", import.meta.url), "utf8");

test("the notebook quote and avatar are editable private state", () => {
  assert.match(component, /側邊手帳短句/);
  assert.match(component, /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(component, /createAvatarDataUrl/);
  assert.match(component, /state\.personalization\?\.sidebarNote/);
  assert.match(component, /state\.personalization\?\.avatarDataUrl/);
  assert.match(component, /onCompositionStart/);
  assert.match(component, /onCompositionEnd/);
  assert.doesNotMatch(component, /側邊手帳短句[\s\S]{0,300}maxLength=\{27\}/);
});

test("Chinese is the default heading language while structural notebook labels remain", () => {
  assert.match(component, /手帳標題語言/);
  assert.match(component, /<option value="zh-TW">中文（預設）<\/option>/);
  assert.match(component, /data-heading-language=\{state\.personalization\?\.headingLanguage/);
  assert.match(component, /eyebrow structural-eyebrow">Chapter \{meta\.number\}/);
  assert.match(storage, /headingLanguage === "en" \? "en" : "zh-TW"/);
});

test("avatar imports accept only bounded raster data URLs", () => {
  assert.match(storage, /data:image/);
  assert.match(storage, /png\|jpeg\|webp/);
  assert.match(storage, /avatarDataUrl\.length <= 450_000/);
});

test("the introduction leads with the exchange-planning outcome and reviewable AI boundary", () => {
  assert.match(welcome, /交換大小事，<br \/>整理成下一步/);
  assert.match(welcome, /Exchange student &amp; study abroad planner/);
  assert.match(welcome, /智慧資源庫/);
  assert.match(welcome, /Telegram 直接按按鈕或傳一句話，不用背指令/);
  assert.match(welcome, /AI 只能送出待確認提案/);
  assert.doesNotMatch(welcome, /交換很複雜/);
});
