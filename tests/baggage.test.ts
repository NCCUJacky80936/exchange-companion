import assert from "node:assert/strict";
import test from "node:test";
import { assignedBagWeightBreakdown } from "../app/lib/baggage";
import type { Bag, PackingItem } from "../app/lib/types";

const bags: Bag[] = [
  { id: "checked", name: "托運箱", kind: "checked", limitKg: 23, limitSource: "ticket" },
  { id: "carry", name: "手提箱", kind: "carry-on", limitKg: 7, limitSource: "ticket" },
  { id: "personal", name: "隨身包", kind: "personal", limitKg: 0, limitSource: "ticket" },
];

const baseItem = {
  category: "測試",
  decision: "must" as const,
  quantity: 1,
  packed: false,
};

test("assigned weight uses the overall total while preserving bag-kind subtotals", () => {
  const items: PackingItem[] = [
    { ...baseItem, id: "one", name: "托運物品", bagId: "checked", weightKg: 2.1 },
    { ...baseItem, id: "two", name: "手提物品", bagId: "carry", weightKg: 2.8 },
    { ...baseItem, id: "three", name: "個人物品", bagId: "personal", weightKg: 0.6 },
    { ...baseItem, id: "four", name: "未分配物品", bagId: "", weightKg: 1.2 },
  ];

  assert.deepEqual(assignedBagWeightBreakdown(bags, items), {
    checkedKg: 2.1,
    carryOnKg: 2.8,
    personalKg: 0.6,
    totalKg: 5.5,
  });
});
