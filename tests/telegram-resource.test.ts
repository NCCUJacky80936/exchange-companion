import assert from "node:assert/strict";
import test from "node:test";

import { formatTelegramResources, resourcesFromAppState, telegramResourceGroup } from "../supabase/functions/_shared/resource";

const state = {
  resources: [
    { title: "DB Navigator 使用方式", description: "德國鐵路查詢與購票工具。", details: "火車班次與月台。", category: "火車交通", url: "https://example.com/db", sourceLabel: "DB", searchTags: ["德鐵"] },
    { title: "蔥油雞飯", description: "宿舍廚房料理。", details: "雞肉與白飯。", category: "生活食譜", url: "https://example.com/recipe", sourceLabel: "食譜來源", searchTags: ["食譜", "雞肉"] },
  ],
};

test("uses the same user-facing resource groups as the website", () => {
  assert.equal(telegramResourceGroup("生活食譜"), "food");
  assert.equal(telegramResourceGroup("學校行政"), "school");
  assert.equal(telegramResourceGroup("簽證居留"), "admin");
});

test("filters private app-state resources by category or keyword and formats bounded results", () => {
  assert.deepEqual(resourcesFromAppState(state, { group: "transport" }).map((item) => item.title), ["DB Navigator 使用方式"]);
  assert.deepEqual(resourcesFromAppState(state, { query: "雞肉" }).map((item) => item.title), ["蔥油雞飯"]);
  const message = formatTelegramResources(resourcesFromAppState(state), "全部", "https://example.com/?section=resources");
  assert.match(message, /^重要資源｜全部/);
  assert.match(message, /完整內容與智慧搜尋/);
  assert.ok(Array.from(message).length <= 3_900);
});
