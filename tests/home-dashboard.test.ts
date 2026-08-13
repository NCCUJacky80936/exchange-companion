import assert from "node:assert/strict";
import test from "node:test";
import { importAiBundle, journeyScopeForState } from "../app/lib/ai-import";
import { defaultState } from "../app/lib/default-data";
import { buildHomeAgenda, buildHomeBulletins, summarizeHomeBudget } from "../app/lib/home-dashboard";
import { normalizeImportedState } from "../app/lib/storage";
import type { AiImportBundle, AppState } from "../app/lib/types";

function stateCopy(): AppState {
  return structuredClone(defaultState);
}

test("fresh notebooks activate while legacy notebooks remain on the daily dashboard", () => {
  assert.equal(defaultState.homeExperience?.mode, "activation");
  const legacy = stateCopy();
  delete legacy.homeExperience;
  const normalized = normalizeImportedState(legacy);
  assert.deepEqual(normalized.homeExperience, {
    mode: "dashboard",
    workflow: "manual",
    tutorialVersion: 1,
    activatedAt: undefined,
  });
});

test("the first valid AI import completes activation without applying proposals", () => {
  const state = stateCopy();
  const bundle: AiImportBundle = {
    schemaVersion: 1,
    generatedAt: "2026-08-12T08:00:00+08:00",
    journeyScope: journeyScopeForState(state),
    sources: [],
    proposals: [],
  };
  const imported = importAiBundle(state, bundle);
  assert.equal(imported.homeExperience?.mode, "dashboard");
  assert.equal(imported.homeExperience?.workflow, "ai");
  assert.ok(imported.aiInbox?.lastImportedAt);
});

test("14-day agenda crosses months and expands weekly study events without duplicates", () => {
  const state = stateCopy();
  state.tasks = [{ ...state.tasks[0], id: "month-task", title: "跨月期限", dueDate: "2026-09-02", status: "not-started" }];
  state.studyEvents = [{ id: "weekly-class", title: "每週設計課", kind: "class", startDate: "2026-08-27", endDate: "2026-09-30", startTime: "10:00", repeatWeekly: true, mandatory: true, notes: "" }];
  state.travelPlans = [];
  state.journey = { ...state.journey, startDate: "", endDate: "", orientationDate: "" };
  const agenda = buildHomeAgenda(state, "2026-08-27");
  assert.ok(agenda.some((item) => item.id === "task:month-task:2026-09-02"));
  assert.deepEqual(agenda.filter((item) => item.id.startsWith("study:weekly-class")).map((item) => item.date), ["2026-08-27", "2026-09-03"]);
  assert.equal(new Set(agenda.map((item) => item.id)).size, agenda.length);
});

test("risk bulletin keeps overdue and travel conflicts ahead of AI and near-term reminders", () => {
  const state = stateCopy();
  state.tasks = [{ ...state.tasks[0], id: "overdue", title: "逾期任務", dueDate: "2026-08-01", priority: "high", predecessorIds: [], status: "not-started" }];
  state.studyEvents = [{ id: "exam", title: "期末考", kind: "exam", startDate: "2026-08-20", mandatory: true, notes: "" }];
  state.travelPlans = [{ id: "trip", kind: "travel", title: "撞期旅行", startDate: "2026-08-19", endDate: "2026-08-21", destinations: ["Paris"], budget: 0, currency: "EUR", travelers: "", notes: "", days: [], stays: [], references: [], travelNotes: [], packingItems: [], createdAt: "2026-08-12T00:00:00Z", updatedAt: "2026-08-12T00:00:00Z" }];
  state.aiInbox = { sources: [], proposals: [{ id: "p1", entity: "task", action: "update", targetId: "overdue", value: { notes: "更新" }, title: "更新", summary: "摘要", confidence: "high", privacy: "private", evidenceIds: [], status: "pending" }] };
  const bulletins = buildHomeBulletins(state, "2026-08-12");
  assert.equal(bulletins[0]?.priority, 1);
  assert.ok(bulletins.some((item) => item.priority === 2));
  assert.ok(bulletins.some((item) => item.id === "ai-pending"));
});

test("home budget summaries never add different currencies together", () => {
  const summary = summarizeHomeBudget([
    { id: "eur", name: "住宿", category: "housing", amount: 400, currency: "EUR", cadence: "monthly", basis: "confirmed", paid: false, notes: "", sourceLabel: "", verifiedAt: "" },
    { id: "twd", name: "保險", category: "other", amount: 3000, currency: "TWD", cadence: "monthly", basis: "estimate", paid: false, notes: "", sourceLabel: "", verifiedAt: "" },
    { id: "arrival", name: "落地", category: "arrival", amount: 500, currency: "EUR", cadence: "once", basis: "unset", paid: false, notes: "", sourceLabel: "", verifiedAt: "" },
  ]);
  assert.deepEqual(summary.monthly, [{ currency: "EUR", amount: 400 }, { currency: "TWD", amount: 3000 }]);
  assert.deepEqual(summary.once, [{ currency: "EUR", amount: 500 }]);
  assert.deepEqual(summary.basisCounts, { unset: 1, estimate: 1, confirmed: 1 });
});
