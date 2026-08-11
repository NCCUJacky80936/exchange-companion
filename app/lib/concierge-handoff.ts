import { journeyScopeForState } from "./ai-import";
import { exchangeProfile } from "./profile";
import type { AiProposalEntity, AppState } from "./types";

type HandoffSurface = {
  id: string;
  statePath: string;
  proposalEntity: AiProposalEntity;
  privacy: "private" | "mixed";
  fields: string[];
  notes: string;
};

const editableSurfaces: HandoffSurface[] = [
  { id: "journey", statePath: "state.journey", proposalEntity: "journey", privacy: "private", fields: ["title", "ownerName", "homeCity", "hostCity", "hostSchool", "program", "startDate", "endDate", "orientationDate", "destinations"], notes: "日常整理只在新證據修正個人旅程時更新；幣別、時區與圖片屬第一次建站設定。" },
  { id: "tasks", statePath: "state.tasks[]", proposalEntity: "task", privacy: "private", fields: ["title", "description", "phase", "status", "priority", "dueDate", "predecessorIds", "notes", "sourceLabel", "sourceUrl", "verifiedAt", "templateKind", "scheduledAt", "timeZone", "location", "contactName", "contactInfo", "referenceNumber", "cost", "currency", "checklist", "records", "result"], notes: "保留手動紀錄；只有較新的矛盾證據可提出可見修正。" },
  { id: "resources", statePath: "state.resources[]", proposalEntity: "resource", privacy: "mixed", fields: ["title", "description", "details", "category", "type", "url", "verifiedAt", "region", "origin", "privacy", "sourceLabel"], notes: "私人上傳衍生資料保持 private；去識別的官方公共資源才可 shareable。" },
  { id: "resource-intake", statePath: "state.resourceIntake[]", proposalEntity: "resource-intake", privacy: "private", fields: ["url", "note", "status", "createdAt"], notes: "pending URL 只授權處理該網址，不授權擴大掃描。" },
  { id: "packing", statePath: "state.packingItems[]", proposalEntity: "packing-item", privacy: "mixed", fields: ["name", "category", "decision", "bagId", "quantity", "weightKg", "packed", "warning"], notes: "依目的地、季節、住宿與本人機票調整；經驗影片只在背景協助找漏項。" },
  { id: "bags", statePath: "state.bags[]", proposalEntity: "bag", privacy: "private", fields: ["name", "kind", "limitKg", "limitSource"], notes: "每件實體行李獨立記錄，票面額度必須引用本人授權機票。" },
  { id: "flight-allowances", statePath: "state.flightAllowances[]", proposalEntity: "flight-allowance", privacy: "private", fields: ["label", "airline", "segment", "checkedMode", "checkedPieceCount", "checkedPieceWeightKg", "checkedTotalWeightKg", "carryOnMode", "carryOnPieceCount", "carryOnPieceWeightKg", "personalItemMode", "personalItemPieceCount", "personalItemPieceWeightKg", "provenance", "confirmed", "sourceLabel", "verifiedAt", "notes"], notes: "只能依目前使用者明確授權的電子機票或行程收據建立。" },
  { id: "base-budget", statePath: "state.budget[]", proposalEntity: "budget-item", privacy: "private", fields: ["name", "category", "amount", "currency", "cadence", "basis", "paid", "notes", "sourceLabel", "verifiedAt"], notes: "confirmed 代表有合約、票價、學校或使用者確認依據；沒有證據的生活費只能標成 estimate 或保留 unset。" },
  { id: "study-events", statePath: "state.studyEvents[]", proposalEntity: "study-event", privacy: "private", fields: ["title", "kind", "startDate", "endDate", "startTime", "repeatWeekly", "mandatory", "notes"], notes: "供旅行衝突檢查使用，不納入公開分享。" },
  { id: "travel-plans", statePath: "state.travelPlans[]", proposalEntity: "travel-plan", privacy: "mixed", fields: ["title", "destinations", "startDate", "endDate", "travelers", "budget", "currency", "notes", "days[].activities[].time", "days[].activities[].location", "days[].activities[].mapsUrl", "days[].activities[].durationMinutes", "days[].activities[].cost", "days[].activities[].booked", "travelNotes[]", "packingItems[]"], notes: "支援空白開始與未來多國旅行；分享前仍需由使用者選定單一旅程與權限。" },
];

export function createExchangeConciergeHandoff(state: AppState, generatedAt = new Date().toISOString()) {
  const journeyScope = journeyScopeForState(state);
  return {
    schemaVersion: 1,
    kind: "exchange-companion-handoff" as const,
    generatedAt,
    journeyScope,
    outputTemplate: {
      schemaVersion: 1 as const,
      generatedAt,
      journeyScope,
      sources: [],
      proposals: [],
    },
    agentContract: {
      repository: "https://github.com/NCCUJacky80936/exchange-companion",
      requiredSkill: "$exchange-concierge",
      requiredSkillPath: ".agents/skills/exchange-concierge/SKILL.md",
      emailSkill: "$exchange-email-intake",
      emailSkillPath: ".agents/skills/exchange-email-intake/SKILL.md",
      firstUseSkill: "$create-exchange-companion",
      firstUseSkillPath: ".agents/skills/create-exchange-companion/SKILL.md",
      currentStatePath: "state",
      outputPath: "outputs/exchange-companion-import.json",
      initializer: ".agents/skills/exchange-concierge/scripts/initialize_import_bundle.py",
      importContract: {
        schemaVersion: 1,
        schemaReference: ".agents/skills/exchange-concierge/references/import-bundle-schema.md",
        validator: ".agents/skills/exchange-concierge/scripts/validate_import_bundle.py",
        rootFields: ["schemaVersion", "generatedAt", "journeyScope", "sources", "proposals"],
        sourceFields: ["id", "label", "kind", "evidenceType", "url", "capturedAt", "note"],
        proposalFields: ["id", "title", "summary", "entity", "action", "targetId", "value", "confidence", "privacy", "evidenceIds", "status"],
        proposalStatus: "pending" as const,
        actions: ["add", "update"] as const,
        confidence: ["high", "medium", "low"] as const,
        privacy: ["private", "shareable"] as const,
      },
      instructions: [
        "Invoke the required project skill before processing. If it is unavailable in the current session, open the linked repository at the skill path before continuing; do not improvise a different import format.",
        "Use the state object as the current source of truth and preserve manual or accepted values.",
        "Initialize the result from outputTemplate (or the listed initializer) before adding sources and proposals. Never reuse root metadata from outputs/, tests/fixtures/, examples, or an older run.",
        "Preserve outputTemplate.journeyScope exactly and validate the finished result against this same handoff file.",
        "Invoke the email skill only for exact accounts, messages, senders, queries, and date ranges authorized by the current user.",
        "Return only pending, evidence-backed proposals supported by the import schema; never mutate browser state directly.",
        "Treat setupSnapshot as first-use context. Do not routinely change country, time zones, currencies, interface copy, or artwork.",
        "If repository visuals or fixed interface copy must change, use the first-use skill and rebuild the repository; those are not browser import proposals.",
      ],
    },
    setupSnapshot: {
      lifecycle: "first-use-only" as const,
      lockedForRoutineReconciliation: true,
      profile: exchangeProfile,
      repositoryManagedSurfaces: {
        visuals: ["visual.heroImage", "visual.socialImage", "visual.icon"],
        fixedInterfaceCopy: ["app/components", "app/layout.tsx", "app/manifest.ts"],
        rule: "Update these only during first setup or an explicit redesign request, then validate and rebuild once.",
      },
    },
    editableSurfaces,
    state,
  };
}

export type ExchangeConciergeHandoff = ReturnType<typeof createExchangeConciergeHandoff>;
