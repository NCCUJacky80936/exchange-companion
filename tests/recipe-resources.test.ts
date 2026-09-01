import assert from "node:assert/strict";
import test from "node:test";

import { isRecipeResource, pickRandomRecipe } from "../app/lib/recipe-resources";
import type { ResourceItem } from "../app/lib/types";
import { formatTelegramRecipe, isActiveRecipeConnection, pickTelegramRecipe, recipesFromAppState } from "../supabase/functions/_shared/recipe";

function resource(overrides: Partial<ResourceItem> = {}): ResourceItem {
  return {
    id: "resource-recipe",
    title: "番茄肉醬義大利麵",
    description: "一鍋完成的番茄牛肉麵。",
    details: "番茄、牛絞肉與義大利麵一起煮。",
    category: "生活食譜",
    type: "experience",
    url: "https://www.instagram.com/example/reel/recipe/",
    verifiedAt: "2026-09-01",
    region: "Germany",
    origin: "ai-research",
    privacy: "private",
    sourceLabel: "Instagram @example",
    searchTags: ["食譜", "義大利麵", "牛肉"],
    ...overrides,
  };
}

test("finds only explicitly tagged recipe resources and selects one", () => {
  const nonRecipe = resource({ id: "resource-visa", category: "簽證", searchTags: ["學生簽證"] });
  assert.equal(isRecipeResource(nonRecipe), false);
  assert.equal(isRecipeResource(resource()), true);
  assert.equal(pickRandomRecipe([nonRecipe, resource()], () => 0)?.id, "resource-recipe");
  assert.equal(pickRandomRecipe([nonRecipe], () => 0), null);
});

test("filters Telegram recipes by keyword and formats a bounded plain-text response", () => {
  const state = { resources: [resource({ privacy: "shareable" }), resource({ id: "resource-chicken", title: "蔥油雞飯", searchTags: ["食譜", "雞肉"] })] };
  const recipes = recipesFromAppState(state, "雞肉");
  assert.equal(recipes.length, 1);
  assert.equal(pickTelegramRecipe(recipes, () => 0)?.title, "蔥油雞飯");
  const message = formatTelegramRecipe({ ...recipes[0], details: "步驟".repeat(3_000) }, "https://example.com/?inbox=open");
  assert.match(message, /^🍳 蔥油雞飯/);
  assert.ok(Array.from(message).length <= 3_900);
  assert.match(message, /手帳：https:\/\/example\.com/);
  const oversized = formatTelegramRecipe({ title: "菜".repeat(1_000), description: "摘要".repeat(1_000), details: "步驟".repeat(3_000), sourceLabel: "來源".repeat(1_000), url: `https://example.com/${"x".repeat(2_000)}` }, `https://example.com/${"y".repeat(2_000)}`);
  assert.ok(Array.from(oversized).length <= 3_900);
});

test("requires an unexpired read-state connection for Telegram recipe access", () => {
  const active = { revoked_at: null, expires_at: "2026-09-02T00:00:00Z", scopes: ["read_state", "submit_proposals"] };
  assert.equal(isActiveRecipeConnection(active, Date.parse("2026-09-01T00:00:00Z")), true);
  assert.equal(isActiveRecipeConnection({ ...active, revoked_at: "2026-09-01T00:00:00Z" }, Date.parse("2026-09-01T00:00:00Z")), false);
  assert.equal(isActiveRecipeConnection({ ...active, expires_at: "2026-08-31T23:59:59Z" }, Date.parse("2026-09-01T00:00:00Z")), false);
  assert.equal(isActiveRecipeConnection({ ...active, scopes: ["submit_proposals"] }, Date.parse("2026-09-01T00:00:00Z")), false);
});
