import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAiProposal,
  canApplyAiProposal,
  canUndoAiProposal,
  findAiBundleCollisions,
  importAiBundle,
  journeyScopeForState,
  matchesAiJourneyScope,
  sensitiveBundleWarnings,
  undoAiProposal,
  validateAiImportBundle,
} from "../app/lib/ai-import";
import { defaultState } from "../app/lib/default-data";
import { evaluateBaggageAllowances } from "../app/lib/baggage";
import { createExchangeConciergeHandoff } from "../app/lib/concierge-handoff";
import { normalizeImportedState } from "../app/lib/storage";
import type { AiImportBundle, AiProposal, AppState } from "../app/lib/types";

function validResourceBundle(): AiImportBundle {
  return {
    schemaVersion: 1,
    generatedAt: "2027-01-15T12:00:00+08:00",
    journeyScope: "Example University exchange 2027",
    sources: [{
      id: "source-city-2027-01-15",
      label: "City newcomer guide",
      kind: "city",
      url: "https://example.org/newcomers",
      capturedAt: "2027-01-15",
    }],
    proposals: [{
      id: "proposal-resource-2027-01-15",
      title: "加入城市官方資源",
      summary: "官方頁面已確認，等待使用者套用。",
      entity: "resource",
      action: "add",
      value: {
        id: "resource-city-newcomer-guide",
        title: "City newcomer guide",
        description: "Official arrival information.",
        details: "Applies to newly arrived exchange students. Check the required registration steps, documents, deadline, and office instructions on the current official page before visiting.",
        category: "arrival",
        type: "city",
        url: "https://example.org/newcomers",
        verifiedAt: "2027-01-15",
        region: "Example City",
        origin: "ai-research",
        privacy: "shareable",
        sourceLabel: "City official website",
      },
      confidence: "high",
      privacy: "shareable",
      evidenceIds: ["source-city-2027-01-15"],
      status: "pending",
    }],
  };
}

function cleanState(): AppState {
  return { ...structuredClone(defaultState), aiInbox: { sources: [], proposals: [] } };
}

test("accepts a complete, reviewable resource proposal", () => {
  const bundle = validResourceBundle();
  assert.equal(validateAiImportBundle(bundle), true);
  assert.deepEqual(canApplyAiProposal(cleanState(), bundle.proposals[0]), { valid: true });
});

test("exports a self-describing handoff with first-use setup locked for routine updates", () => {
  const state = cleanState();
  const handoff = createExchangeConciergeHandoff(state, "2027-01-15T12:00:00+08:00");
  assert.equal(handoff.kind, "exchange-companion-handoff");
  assert.equal(handoff.journeyScope, journeyScopeForState(state));
  assert.equal(handoff.agentContract.requiredSkill, "$exchange-concierge");
  assert.equal(handoff.agentContract.emailSkill, "$exchange-email-intake");
  assert.equal(handoff.agentContract.importContract.proposalStatus, "pending");
  assert.equal(handoff.agentContract.initializer, ".agents/skills/exchange-concierge/scripts/initialize_import_bundle.py");
  assert.equal(handoff.outputTemplate.journeyScope, journeyScopeForState(state));
  assert.deepEqual(handoff.outputTemplate.sources, []);
  assert.deepEqual(handoff.outputTemplate.proposals, []);
  assert.equal(handoff.setupSnapshot.lockedForRoutineReconciliation, true);
  assert.equal(handoff.editableSurfaces.find((surface) => surface.id === "base-budget")?.proposalEntity, "budget-item");
  assert.equal(handoff.editableSurfaces.find((surface) => surface.id === "travel-plans")?.fields.includes("days[].activities[].mapsUrl"), true);
  assert.equal(handoff.state, state);
});

test("applies and safely undoes a private evidence-backed base-budget proposal", () => {
  const state = cleanState();
  const proposal: AiProposal = {
    ...validResourceBundle().proposals[0],
    id: "proposal-budget-rent-run-1",
    entity: "budget-item",
    action: "update",
    targetId: "rent",
    value: {
      amount: 393,
      currency: "EUR",
      basis: "confirmed",
      sourceLabel: "Authorized housing contract",
      verifiedAt: "2027-01-15",
      notes: "Monthly rent confirmed; private identifiers removed.",
    },
    privacy: "private",
  };
  const bundle = { ...validResourceBundle(), journeyScope: journeyScopeForState(state), proposals: [proposal] };
  assert.equal(validateAiImportBundle(bundle), true);
  const imported = importAiBundle(state, bundle);
  const applied = applyAiProposal(imported, proposal.id);
  assert.equal(applied.budget.find((item) => item.id === "rent")?.amount, 393);
  assert.equal(applied.budget.find((item) => item.id === "rent")?.basis, "confirmed");
  const undone = undoAiProposal(applied, proposal.id);
  assert.equal(undone.budget.find((item) => item.id === "rent")?.amount, 0);

  const publicBudget = { ...proposal, id: "proposal-budget-public-run-1", privacy: "shareable" as const };
  assert.equal(validateAiImportBundle({ ...bundle, proposals: [publicBudget] }), false);
  const unsupportedAmount = { ...proposal, id: "proposal-budget-unsupported-run-1", value: { amount: 500 } };
  assert.equal(validateAiImportBundle({ ...bundle, proposals: [unsupportedAmount] }), false);
});

test("updates a signed-in user's journey through a private reversible proposal", () => {
  const state = cleanState();
  const bundle = validResourceBundle();
  bundle.journeyScope = journeyScopeForState(state);
  bundle.proposals = [{
    ...bundle.proposals[0],
    id: "proposal-journey-run-1",
    entity: "journey",
    action: "update",
    targetId: state.journey.id,
    value: { hostSchool: "Example University", hostCity: "Tokyo", destinations: ["Japan"], startDate: "2027-09-01", endDate: "2028-01-31" },
    privacy: "private",
  }];
  assert.equal(validateAiImportBundle(bundle), true);
  const imported = importAiBundle(state, bundle);
  const applied = applyAiProposal(imported, "proposal-journey-run-1");
  assert.equal(applied.journey.hostCity, "Tokyo");
  assert.deepEqual(applied.journey.destinations, ["Japan"]);
  assert.equal(undoAiProposal(applied, "proposal-journey-run-1").journey.hostCity, state.journey.hostCity);
});

test("repairs incomplete legacy tasks before the journey page renders", () => {
  const state = cleanState();
  state.tasks[0] = { ...state.tasks[0], status: "broken", predecessorIds: undefined, templateKind: "broken" } as unknown as typeof state.tasks[number];
  const normalized = normalizeImportedState(state);
  assert.equal(normalized.tasks[0].status, "not-started");
  assert.deepEqual(normalized.tasks[0].predecessorIds, []);
  assert.equal(normalized.tasks[0].templateKind, "general");
});

test("requires onboarding for untouched template journeys but preserves configured users", () => {
  const blank = normalizeImportedState({ ...cleanState(), setupCompleted: undefined });
  assert.equal(blank.setupCompleted, false);
  const configured = normalizeImportedState({
    ...cleanState(),
    setupCompleted: undefined,
    journey: { ...cleanState().journey, hostSchool: "Configured University", hostCity: "Configured City", destinations: ["Configured Country"] },
  });
  assert.equal(configured.setupCompleted, true);
});

test("requires the import bundle to match the current exchange journey", () => {
  const state = cleanState();
  const bundle = validResourceBundle();
  assert.equal(matchesAiJourneyScope(state, bundle), false);
  bundle.journeyScope = journeyScopeForState(state);
  assert.equal(matchesAiJourneyScope(state, bundle), true);
  assert.equal(importAiBundle(state, bundle).aiInbox?.journeyScope, bundle.journeyScope);
});

test("rejects malformed updates and timestamps without a UTC offset", () => {
  const malformed = validResourceBundle();
  malformed.proposals[0] = {
    ...malformed.proposals[0],
    entity: "task",
    action: "update",
    targetId: "accept-place",
    value: { status: 3 },
  };
  assert.equal(validateAiImportBundle(malformed), false);

  const offsetless = validResourceBundle();
  offsetless.generatedAt = "2027-01-15T12:00:00";
  assert.equal(validateAiImportBundle(offsetless), false);
});

test("rejects invisible outer or nested fields and reversed ranges", () => {
  const hiddenSource = validResourceBundle() as unknown as Record<string, unknown>;
  (hiddenSource.sources as Array<Record<string, unknown>>)[0].rawEmailBody = "private body";
  assert.equal(validateAiImportBundle(hiddenSource), false);

  const hiddenProposal = validResourceBundle() as unknown as Record<string, unknown>;
  (hiddenProposal.proposals as Array<Record<string, unknown>>)[0].previousValue = { privateMessageId: "abc" };
  assert.equal(validateAiImportBundle(hiddenProposal), false);

  const hiddenNested = validResourceBundle();
  hiddenNested.proposals[0] = {
    ...hiddenNested.proposals[0],
    entity: "task",
    value: {
      id: "task-example",
      title: "Example task",
      description: "",
      phase: "pre-departure",
      status: "not-started",
      priority: "medium",
      predecessorIds: [],
      notes: "",
      checklist: [{ id: "check-example", label: "Check", done: false, rawEmailBody: "hidden" }],
    },
  };
  assert.equal(validateAiImportBundle(hiddenNested), false);

  const reversed = validResourceBundle();
  reversed.proposals[0] = {
    ...reversed.proposals[0],
    entity: "study-event",
    value: { id: "study-example", title: "Exam", kind: "exam", startDate: "2027-04-10", endDate: "2027-04-09", mandatory: true, notes: "" },
  };
  assert.equal(validateAiImportBundle(reversed), false);
});

test("blocks missing targets, duplicate adds, and invalid bag references at apply time", () => {
  const state = cleanState();
  const missingTarget: AiProposal = {
    ...validResourceBundle().proposals[0],
    id: "proposal-missing-target-2027-01-15",
    action: "update",
    targetId: "missing-resource",
    value: { title: "Updated title" },
  };
  assert.equal(canApplyAiProposal(state, missingTarget).valid, false);

  const duplicateAdd: AiProposal = {
    ...validResourceBundle().proposals[0],
    id: "proposal-duplicate-task-2027-01-15",
    entity: "task",
    value: { ...state.tasks[0] },
  };
  assert.equal(canApplyAiProposal(state, duplicateAdd).valid, false);

  const invalidBag: AiProposal = {
    ...validResourceBundle().proposals[0],
    id: "proposal-packing-2027-01-15",
    entity: "packing-item",
    value: {
      id: "packing-example",
      name: "Example item",
      category: "other",
      decision: "recommend",
      bagId: "missing-bag",
      quantity: 1,
      weightKg: 0.2,
      packed: false,
    },
  };
  assert.equal(validateAiImportBundle({ ...validResourceBundle(), proposals: [invalidBag] }), true);
  assert.equal(canApplyAiProposal(state, invalidBag).valid, false);
});

test("accepts only ticket-specific baggage rules with consistent allowance fields", () => {
  const state = cleanState();
  const bundle = validResourceBundle();
  bundle.sources = [{
    id: "source-ticket-run-1",
    label: "User-authorized e-ticket",
    kind: "file",
    evidenceType: "ticket",
    capturedAt: "2027-01-15",
  }];
  const allowance: AiProposal = {
    ...bundle.proposals[0],
    id: "proposal-flight-allowance-run-1",
    entity: "flight-allowance",
    value: {
      id: "flight-allowance-outbound-ticket",
      label: "Outbound ticket",
      airline: "Example Air",
      segment: "TPE → NRT",
      checkedMode: "piece",
      checkedPieceCount: 1,
      checkedPieceWeightKg: 23,
      checkedTotalWeightKg: 0,
      carryOnMode: "piece",
      carryOnPieceCount: 1,
      carryOnPieceWeightKg: 7,
      personalItemMode: "unknown",
      personalItemPieceCount: 0,
      personalItemPieceWeightKg: 0,
      provenance: "ticket",
      confirmed: false,
      sourceLabel: "User-authorized e-ticket",
      verifiedAt: "2027-01-15",
      notes: "Passenger and booking identifiers removed.",
    },
    privacy: "private",
    evidenceIds: ["source-ticket-run-1"],
  };
  bundle.proposals = [allowance];
  assert.equal(validateAiImportBundle(bundle), true);
  const stateWithEvidence = { ...state, aiInbox: { sources: bundle.sources, proposals: [allowance] } };
  assert.equal(canApplyAiProposal(stateWithEvidence, allowance).valid, true);

  const applied = applyAiProposal(stateWithEvidence, allowance.id);
  assert.equal(applied.flightAllowances?.[0].airline, "Example Air");

  const inconsistent = structuredClone(bundle);
  inconsistent.proposals[0].value.checkedPieceCount = 0;
  assert.equal(validateAiImportBundle(inconsistent), false);

  const wrongSource = structuredClone(bundle);
  wrongSource.sources[0] = { ...wrongSource.sources[0], kind: "video", evidenceType: "general" };
  assert.equal(validateAiImportBundle(wrongSource), false);
});

test("keeps a multi-segment allowance unconfirmed and enforces per-piece limits", () => {
  const state = cleanState();
  state.bags = [
    { id: "checked-1", name: "Checked 1", kind: "checked", limitKg: 0, limitSource: "unconfirmed" },
    { id: "carry-1", name: "Carry", kind: "carry-on", limitKg: 0, limitSource: "unconfirmed" },
  ];
  state.packingItems = [
    { id: "heavy", name: "Heavy load", category: "test", decision: "must", bagId: "checked-1", quantity: 1, weightKg: 40, packed: false },
    { id: "carry", name: "Carry load", category: "test", decision: "must", bagId: "carry-1", quantity: 1, weightKg: 6, packed: false },
  ];
  const base = {
    id: "allowance-1", label: "Ticket", airline: "Example Air", segment: "A → B",
    checkedMode: "piece" as const, checkedPieceCount: 2, checkedPieceWeightKg: 23, checkedTotalWeightKg: 0,
    carryOnMode: "piece" as const, carryOnPieceCount: 1, carryOnPieceWeightKg: 7,
    personalItemMode: "none" as const, personalItemPieceCount: 0, personalItemPieceWeightKg: 0,
    provenance: "ticket" as const, confirmed: true, sourceLabel: "Authorized ticket", verifiedAt: "2027-01-15", notes: "",
  };
  const perPiece = evaluateBaggageAllowances(state.bags, state.packingItems, [base]);
  assert.equal(perPiece.ready, true);
  assert.ok(perPiece.issues.some((issue) => issue.includes("每件 23kg")));

  const emptyBagStillCounts = evaluateBaggageAllowances([
    ...state.bags,
    { id: "checked-2", name: "Checked 2", kind: "checked", limitKg: 0, limitSource: "unconfirmed" },
  ], state.packingItems, [{ ...base, checkedPieceCount: 1 }]);
  assert.ok(emptyBagStillCounts.issues.some((issue) => issue.includes("超過 1 件")));

  const threeSegments = [
    base,
    { ...base, id: "allowance-2", segment: "B → C", checkedMode: "weight" as const, checkedPieceCount: 0, checkedPieceWeightKg: 0, checkedTotalWeightKg: 30 },
    { ...base, id: "allowance-3", segment: "C → D", checkedMode: "unknown" as const, checkedPieceCount: 0, checkedPieceWeightKg: 0, confirmed: false },
  ];
  const incomplete = evaluateBaggageAllowances(state.bags, state.packingItems, threeSegments);
  assert.equal(incomplete.ready, false);
  assert.equal(incomplete.strictCheckedLimitKg, undefined);
});

test("accepts a private pending URL intake and rejects credential-like URLs", () => {
  const bundle = validResourceBundle();
  bundle.proposals = [{
    ...bundle.proposals[0],
    id: "proposal-resource-intake-run-1",
    entity: "resource-intake",
    value: { id: "resource-intake-1", url: "https://example.org/exchange", note: "Check deadline", status: "pending", createdAt: "2027-01-15T12:00:00+08:00" },
    privacy: "private",
  }];
  assert.equal(validateAiImportBundle(bundle), true);
  bundle.proposals[0].value.url = "https://example.org/private?access_token=secret-value";
  assert.equal(validateAiImportBundle(bundle), false);
});

test("does not mark an unappliable proposal as applied", () => {
  const state = cleanState();
  const proposal: AiProposal = {
    ...validResourceBundle().proposals[0],
    id: "proposal-missing-target-2027-01-15",
    action: "update",
    targetId: "missing-resource",
    value: { title: "Updated title" },
  };
  state.aiInbox = { sources: validResourceBundle().sources, proposals: [proposal] };
  const next = applyAiProposal(state, proposal.id);
  assert.equal(next, state);
  assert.equal(next.aiInbox?.proposals[0].status, "pending");
});

test("undo preserves later manual edits and refuses conflicting reversals", () => {
  const state = cleanState();
  const originalNotes = state.tasks[0].notes;
  const proposal: AiProposal = {
    ...validResourceBundle().proposals[0],
    id: "proposal-task-notes-2027-01-15",
    entity: "task",
    action: "update",
    targetId: state.tasks[0].id,
    value: { notes: "AI suggestion" },
  };
  state.aiInbox = { sources: validResourceBundle().sources, proposals: [proposal] };
  const applied = applyAiProposal(state, proposal.id);
  const withUnrelatedManualEdit = {
    ...applied,
    tasks: applied.tasks.map((task) => task.id === state.tasks[0].id ? { ...task, title: "My later manual title" } : task),
  };
  const appliedProposal = withUnrelatedManualEdit.aiInbox?.proposals[0];
  assert.ok(appliedProposal);
  assert.equal(canUndoAiProposal(withUnrelatedManualEdit, appliedProposal).valid, true);
  const undone = undoAiProposal(withUnrelatedManualEdit, proposal.id);
  assert.equal(undone.tasks[0].notes, originalNotes);
  assert.equal(undone.tasks[0].title, "My later manual title");

  const reapplied = applyAiProposal(undone, proposal.id);
  const withConflictingEdit = {
    ...reapplied,
    tasks: reapplied.tasks.map((task) => task.id === state.tasks[0].id ? { ...task, notes: "My newer manual note" } : task),
  };
  const conflictingProposal = withConflictingEdit.aiInbox?.proposals[0];
  assert.ok(conflictingProposal);
  assert.equal(canUndoAiProposal(withConflictingEdit, conflictingProposal).valid, false);
  assert.equal(undoAiProposal(withConflictingEdit, proposal.id), withConflictingEdit);
});

test("reports collisions and preserves existing inbox history", () => {
  const bundle = validResourceBundle();
  const existingProposal = { ...bundle.proposals[0], title: "Existing pending review" };
  const state = cleanState();
  state.aiInbox = { sources: bundle.sources, proposals: [existingProposal] };

  assert.deepEqual(findAiBundleCollisions(state, bundle), [
    `source:${bundle.sources[0].id}`,
    `proposal:${bundle.proposals[0].id}`,
  ]);
  const next = importAiBundle(state, bundle);
  assert.equal(next.aiInbox?.sources[0].label, bundle.sources[0].label);
  assert.equal(next.aiInbox?.proposals[0].title, "Existing pending review");
});

test("warns before importing common private identifiers or long excerpts", () => {
  const bundle = validResourceBundle();
  bundle.proposals[0].summary = `Contact student@example.org about booking reference 123456789. ${"x".repeat(700)}`;
  const warnings = sensitiveBundleWarnings(bundle);
  assert.ok(warnings.includes("Email 地址"));
  assert.ok(warnings.includes("長數字／可能的帳號或參考號碼"));
  assert.ok(warnings.includes("證件、訂位、付款或住址關鍵字"));
  assert.ok(warnings.includes("可能的長篇原文摘錄"));
});
