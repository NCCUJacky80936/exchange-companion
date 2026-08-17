import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cloud = await readFile(new URL("../app/lib/cloud.ts", import.meta.url), "utf8");
const controller = await readFile(new URL("../app/lib/useExchangeCloud.ts", import.meta.url), "utf8");
const companion = await readFile(new URL("../app/components/ExchangeCompanion.tsx", import.meta.url), "utf8");
const planner = await readFile(new URL("../app/components/TravelPlanner.tsx", import.meta.url), "utf8");

test("invited travel editors use a passwordless trip-only flow", () => {
  assert.match(cloud, /sendTravelGuestMagicLink/);
  assert.match(cloud, /shouldCreateUser:\s*true/);
  assert.match(cloud, /redirect\.searchParams\.set\("share",\s*shareToken\)/);
  assert.match(controller, /requestGuestEditorAccess/);
  assert.match(companion, /你是受邀的編輯者嗎？/);
  assert.match(companion, /不需要建立交換手帳或密碼/);
  assert.match(companion, /setTimeout\(\(\) => setCompact\(true\), 30_000\)/);
  assert.match(companion, /className="guest-editor-compact"/);
});

test("a verified member stays in the shared travel shell", () => {
  assert.match(companion, /cloud\.shareStatus === "active" && activeSharedPlan\?\.cloud\?\.permission !== "owner"/);
  assert.match(controller, /shareStatus === "loading" \|\| \(shareStatus === "active" && sharedPlanPermission !== "owner"\)/);
  assert.match(planner, /指定帳戶會覆蓋一般連結權限/);
});
