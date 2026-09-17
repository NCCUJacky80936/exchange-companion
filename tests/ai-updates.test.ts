import assert from "node:assert/strict";
import test from "node:test";
import { applyAiProposal, clearDismissedAiProposals, dismissAiProposal, importAiBundle, pruneExpiredAiHistory, undoAiProposal } from "../app/lib/ai-import";
import { captureAiUpdates, groupAiUpdates, markAiUpdatesRead, normalizeAiActivity, selectAiUpdates, targetForUpdate } from "../app/lib/ai-updates";
import { defaultState } from "../app/lib/default-data";
import { normalizeImportedState } from "../app/lib/storage";
import { publicTravelPayload } from "../app/lib/travel-cloud";
import type { AiImportBundle, AppState } from "../app/lib/types";

function fixture(): AppState {
  const state = structuredClone(defaultState);
  state.aiInbox = { proposals: [], sources: [] };
  const bundle: AiImportBundle = { schemaVersion: 1, generatedAt: new Date().toISOString(), journeyScope: `exchange:${state.journey.id}`, sources: [{ id: "mail", label: "學校通知", kind: "email", capturedAt: "2026-09-17", url: "https://example.org/news" }], proposals: [{ id: "time-change", title: "迎新時間調整", summary: "學校調整迎新日期，請確認。", entity: "journey", action: "update", targetId: state.journey.id, value: { orientationDate: "2026-10-05" }, status: "pending", privacy: "private", evidenceIds: ["mail"], confidence: "high" }] };
  return importAiBundle(state, bundle);
}

test("receipts survive apply, undo, dismiss and inbox cleanup without changing manual review", () => {
  let state = fixture();
  assert.equal(state.aiInbox?.activity?.[0].status, "pending");
  assert.notEqual(state.journey.orientationDate, "2026-10-05");
  assert.deepEqual(targetForUpdate(state.aiInbox!.activity![0], state), { section: "ai", inbox: "open", hash: "proposal-time-change" });
  state = applyAiProposal(state, "time-change");
  assert.equal(state.aiInbox?.activity?.[0].status, "applied");
  assert.equal(state.aiInbox?.activity?.[0].changes[0].after, "2026-10-05");
  state = undoAiProposal(state, "time-change");
  assert.equal(captureAiUpdates(state).aiInbox?.activity?.[0].status, "reverted");
  state = clearDismissedAiProposals(dismissAiProposal(state, "time-change"));
  assert.equal(state.aiInbox?.proposals.length, 0);
  assert.equal(state.aiInbox?.sources.length, 0);
  assert.equal(state.aiInbox?.activity?.[0].status, "dismissed");
  assert.equal(state.aiInbox?.activity?.[0].sources[0].label, "學校通知");
});

test("migration snapshots old inbox before pruning and distinguishes expired from applied", () => {
  const state = fixture();
  delete state.aiInbox!.activity;
  state.aiInbox!.proposals[0].createdAt = "2020-01-01T00:00:00Z";
  const normalized = normalizeImportedState(state);
  assert.equal(normalized.aiInbox?.proposals.length, 0);
  assert.equal(normalized.aiInbox?.activity?.[0].status, "expired");
  const applied = applyAiProposal(fixture(), "time-change");
  const expired = pruneExpiredAiHistory(applied, Date.now() + 9 * 86400000);
  assert.equal(expired.aiInbox?.proposals.length, 0);
  assert.equal(expired.aiInbox?.activity?.[0].status, "applied");
  assert.equal(expired.aiInbox?.activity?.[0].sources.length, 1);
  assert.equal(pruneExpiredAiHistory(expired), expired);
});

test("reading is scoped and does not accept proposals; later changes become unread", () => {
  let state = fixture();
  const at = new Date(Date.now() + 1000).toISOString();
  state = markAiUpdatesRead(state, "resources", at);
  assert.equal(selectAiUpdates(state, "home", "unread").length, 1);
  state = markAiUpdatesRead(state, "journey", at);
  assert.equal(selectAiUpdates(state, "home", "unread").length, 0);
  assert.equal(state.aiInbox?.proposals[0].status, "pending");
  state.aiInbox!.activity![0].updatedAt = new Date(Date.parse(at) + 1000).toISOString();
  assert.equal(selectAiUpdates(state, "home", "unread").length, 1);
});

test("periods use local calendar days and multiple sources group under the same target", () => {
  const state = fixture();
  const now = new Date(2026, 8, 17, 12);
  const today = new Date(2026, 8, 17, 0, 15).toISOString();
  const yesterday = new Date(2026, 8, 16, 23, 55).toISOString();
  const entry = state.aiInbox!.activity![0];
  state.aiInbox!.proposals = [];
  state.aiInbox!.activity = [{ ...entry, id: "a", updatedAt: today }, { ...entry, id: "b", updatedAt: yesterday }];
  assert.equal(selectAiUpdates(state, "home", "today", now).length, 1);
  assert.equal(selectAiUpdates(state, "home", "week", now).length, 2);
  assert.equal(groupAiUpdates(selectAiUpdates(state, "home", "all", now)).length, 1);
});

test("normalization tolerates malformed legacy data and bounds private history", () => {
  assert.deepEqual(normalizeAiActivity({ invalid: true }), []);
  const entry = fixture().aiInbox!.activity![0];
  const normalized = normalizeAiActivity([null, { id: "bad" }, { ...entry, sources: [{ id: "x", kind: "email", label: "來源", url: "javascript:alert(1)" }], changes: [null], updatedAt: "invalid" }]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].sources[0].url, undefined);
  assert.equal(normalized[0].updatedAt, "");
  const many = normalizeAiActivity(Array.from({ length: 500 }, (_, index) => ({ ...entry, id: String(index), summary: "長".repeat(900), changes: Array.from({ length: 20 }, () => ({ field: "備註", before: "甲".repeat(300), after: "乙".repeat(300) })) })));
  assert.ok(many.length <= 300);
  assert.ok(new TextEncoder().encode(JSON.stringify(many)).length < 605000);
  assert.equal("previousValue" in many[0], false);
});

test("receipt capture is idempotent and private history is absent from shared travel", () => {
  const state = fixture();
  assert.equal(captureAiUpdates(state), state);
  const plan = state.travelPlans?.[0];
  if (plan) assert.equal("aiInbox" in publicTravelPayload({ ...plan, aiInbox: state.aiInbox } as typeof plan), false);
});
