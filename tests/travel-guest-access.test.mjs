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

test("verified accounts load every journey membership instead of staying link-bound", () => {
  assert.match(cloud, /export async function listMemberTravelPlans/);
  assert.match(cloud, /from\("travel_members"\)[\s\S]*select\("plan_id, permission"\)/);
  assert.match(cloud, /from\("travel_plans"\)[\s\S]*\.in\("id", planIds\)/);
  assert.match(controller, /const accessiblePlans = await listMemberTravelPlans\(plan\)/);
  assert.match(controller, /travelPlans: plan\.cloud\?\.permission === "owner"[\s\S]*: accessiblePlans/);
  assert.match(companion, /travelPlans: \(state\.travelPlans \?\? \[\]\)\.filter\(\(plan\) => plan\.cloud\?\.published && plan\.cloud\.permission !== "owner"\)/);
  assert.match(companion, /這個帳號可存取 \$\{journeyCount\} 趟旅行/);
});
