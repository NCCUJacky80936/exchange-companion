import assert from "node:assert/strict";
import test from "node:test";

import { resourceGroup, searchResources } from "../app/lib/resource-search";
import type { ResourceItem } from "../app/lib/types";

function resource(overrides: Partial<ResourceItem>): ResourceItem {
  return {
    id: "resource",
    title: "交換資源",
    description: "交換生活資訊。",
    details: "完整內容。",
    category: "一般",
    type: "official",
    url: "https://example.com",
    verifiedAt: "2026-08-01",
    region: "Germany",
    origin: "ai-research",
    privacy: "shareable",
    sourceLabel: "官方網站",
    searchTags: [],
    ...overrides,
  };
}

const resources = [
  resource({ id: "db", title: "DB Navigator 使用方式", description: "德國鐵路查詢與購票工具。", category: "火車交通", searchTags: ["德鐵", "火車"] }),
  resource({ id: "vvs", title: "VVS 交通票方案", description: "斯圖加特大眾運輸與票券資訊。", category: "交通票券", searchTags: ["VVS", "交通"] }),
  resource({ id: "baggage", title: "航空公司行李規則", description: "托運、手提與個人物品限制。", category: "航班行李", searchTags: ["行李", "航空"] }),
  resource({ id: "visa", title: "德國學生簽證", description: "申請文件與預約入口。", category: "簽證行政", verifiedAt: "2026-09-01", privacy: "private" }),
  resource({ id: "recipe", title: "蔥油雞飯", description: "宿舍廚房料理。", category: "生活食譜", type: "experience", searchTags: ["食譜", "雞肉"] }),
  resource({ id: "school", title: "HdM 交換生入口", description: "學校行政與行事曆。", category: "學校行政", type: "school" }),
];

test("groups school administration and recipes by user intent instead of generic administration or living", () => {
  assert.equal(resourceGroup("學校行政"), "學校與學業");
  assert.equal(resourceGroup("生活食譜"), "料理與採買");
  assert.equal(resourceGroup("學生簽證與居留"), "申請與行政");
});

test("understands natural Chinese searches and common transport synonyms", () => {
  assert.deepEqual(searchResources(resources, { query: "我想找德鐵買票的資料" }).map((item) => item.id), ["db"]);
  assert.deepEqual(searchResources(resources, { query: "雞肉食譜" }).map((item) => item.id), ["recipe"]);
  assert.deepEqual(searchResources(resources, { query: "HdM 行事曆" }).map((item) => item.id), ["school"]);
});

test("combines group, source, privacy, and sorting filters", () => {
  assert.deepEqual(searchResources(resources, { group: "申請與行政", privacy: "private" }).map((item) => item.id), ["visa"]);
  assert.deepEqual(searchResources(resources, { type: "school" }).map((item) => item.id), ["school"]);
  const titleSorted = searchResources(resources, { sort: "title" });
  assert.equal(titleSorted.length, resources.length);
  assert.equal(titleSorted.every((item, index) => index === 0 || titleSorted[index - 1].title.localeCompare(item.title, "zh-Hant") <= 0), true);
});
