import type {
  AiImportBundle,
  AiProposal,
  AiProposalEntity,
  AppState,
  Bag,
  BudgetItem,
  FlightAllowance,
  Journey,
  JourneyTask,
  PackingItem,
  ResourceItem,
  ResourceIntake,
  StudyEvent,
  TravelPlan,
} from "./types";
import { stampProcessedResourceIntake } from "./resource-intake";

const SOURCE_KINDS = new Set(["official", "school", "city", "email", "file", "video", "research"]);
const ENTITIES = new Set<AiProposalEntity>(["journey", "task", "resource", "resource-intake", "packing-item", "bag", "flight-allowance", "budget-item", "study-event", "travel-plan"]);
const ACTIONS = new Set(["add", "update"]);
const CONFIDENCE = new Set(["high", "medium", "low"]);
const PRIVACY = new Set(["private", "shareable"]);
const STATUSES = new Set(["pending"]);
const ROOT_FIELDS = new Set(["schemaVersion", "generatedAt", "journeyScope", "baseRevision", "sources", "proposals"]);
const SOURCE_FIELDS = new Set(["id", "label", "kind", "evidenceType", "url", "capturedAt", "note"]);
const PROPOSAL_FIELDS = new Set(["id", "title", "summary", "entity", "action", "targetId", "value", "confidence", "privacy", "evidenceIds", "status"]);
const CHECKLIST_FIELDS = new Set(["id", "label", "done"]);
const RECORD_FIELDS = new Set(["id", "date", "note"]);
const ACTIVITY_FIELDS = new Set(["id", "time", "title", "kind", "location", "mapsUrl", "durationMinutes", "cost", "booked", "notes"]);
const TRAVEL_DAY_FIELDS = new Set(["id", "date", "title", "activities"]);
const TRAVEL_NOTE_FIELDS = new Set(["id", "title", "details", "category", "important"]);
const TRAVEL_PACKING_FIELDS = new Set(["id", "name", "category", "quantity", "packed", "notes"]);
const TRAVEL_STAY_FIELDS = new Set(["id", "name", "checkIn", "checkOut", "area", "address", "mapsUrl", "sourceUrl", "imageUrl", "imageAlt", "summary", "highlights", "notes"]);
const TRAVEL_REFERENCE_FIELDS = new Set(["id", "label", "kind", "url", "description"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsb_secret_[A-Za-z0-9_-]{12,}\b/,
  /\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{20,}\b/,
  /\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/,
  /(?:file:\/\/|\/Users\/|[A-Za-z]:\\Users\\)/,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isText(value: unknown, max = 1_000): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.includes("T") && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value));
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isSafeIntakeUrl(value: unknown): value is string {
  if (!isHttpUrl(value)) return false;
  const url = new URL(value);
  if (url.username || url.password) return false;
  const sensitiveParam = /(?:^|[_-])(?:access[_-]?token|api[_-]?key|apikey|auth|key|password|secret|signature|token)(?:$|[_-])/i;
  return ![...url.searchParams.keys()].some((key) => sensitiveParam.test(key));
}

function hasKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function hasUniqueIds(value: unknown[]): boolean {
  const ids = value.map((item) => isRecord(item) ? item.id : undefined);
  return ids.every((id) => typeof id === "string") && new Set(ids).size === ids.length;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isOptionalText(value: unknown, max = 4_000): boolean {
  return value === undefined || (typeof value === "string" && value.length <= max);
}

function isOptionalDate(value: unknown): boolean {
  return value === undefined || isDate(value);
}

function isLocalDateTime(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  const [day, time] = value.split("T");
  return isDate(day) && isClockTime(time);
}

function isClockTime(value: unknown): boolean {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isCurrency(value: unknown): boolean {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value);
}

function validChecklist(value: unknown): boolean {
  return Array.isArray(value) && hasUniqueIds(value) && value.every((item) => isRecord(item) && hasOnlyKeys(item, CHECKLIST_FIELDS)
    && isText(item.id, 160) && isText(item.label, 300) && isBoolean(item.done));
}

function validRecords(value: unknown): boolean {
  return Array.isArray(value) && hasUniqueIds(value) && value.every((item) => isRecord(item) && hasOnlyKeys(item, RECORD_FIELDS)
    && isText(item.id, 160) && isDate(item.date) && isText(item.note, 2_000));
}

function validActivities(value: unknown): boolean {
  const kinds = new Set(["place", "food", "transport", "stay", "note"]);
  return Array.isArray(value) && hasUniqueIds(value) && value.every((item) => isRecord(item) && hasOnlyKeys(item, ACTIVITY_FIELDS)
    && isText(item.id, 160) && isClockTime(item.time)
    && isText(item.title, 200) && kinds.has(String(item.kind)) && typeof item.location === "string"
    && (item.mapsUrl === undefined || item.mapsUrl === "" || isHttpUrl(item.mapsUrl)) && isNumber(item.durationMinutes)
    && isNumber(item.cost) && isBoolean(item.booked) && typeof item.notes === "string");
}

function validTravelDays(value: unknown, startDate?: string, endDate?: string): boolean {
  return Array.isArray(value) && hasUniqueIds(value) && value.every((item) => isRecord(item) && hasOnlyKeys(item, TRAVEL_DAY_FIELDS)
    && isText(item.id, 160) && isDate(item.date) && (!startDate || item.date >= startDate) && (!endDate || item.date <= endDate)
    && isText(item.title, 200) && validActivities(item.activities));
}

function validTravelNotes(value: unknown): boolean {
  const categories = new Set(["transport", "booking", "safety", "food", "shopping", "general"]);
  return Array.isArray(value) && hasUniqueIds(value) && value.every((item) => isRecord(item) && hasOnlyKeys(item, TRAVEL_NOTE_FIELDS)
    && isText(item.id, 160) && isText(item.title, 200)
    && typeof item.details === "string" && categories.has(String(item.category)) && isBoolean(item.important));
}

function validTravelPacking(value: unknown): boolean {
  return Array.isArray(value) && hasUniqueIds(value) && value.every((item) => isRecord(item) && hasOnlyKeys(item, TRAVEL_PACKING_FIELDS)
    && isText(item.id, 160) && isText(item.name, 200)
    && isText(item.category, 100) && isNumber(item.quantity) && isBoolean(item.packed) && typeof item.notes === "string");
}

function validTravelStays(value: unknown): boolean {
  return Array.isArray(value) && hasUniqueIds(value) && value.every((item) => isRecord(item) && hasOnlyKeys(item, TRAVEL_STAY_FIELDS)
    && isText(item.id, 160) && isText(item.name, 200) && isDate(item.checkIn) && isDate(item.checkOut) && item.checkOut >= item.checkIn
    && typeof item.area === "string" && typeof item.address === "string" && (item.mapsUrl === "" || isHttpUrl(item.mapsUrl))
    && (item.sourceUrl === "" || isHttpUrl(item.sourceUrl)) && (item.imageUrl === "" || isHttpUrl(item.imageUrl))
    && typeof item.imageAlt === "string" && isText(item.summary, 2_000) && isStringArray(item.highlights) && item.highlights.length <= 12
    && item.highlights.every((highlight) => highlight.length <= 200) && typeof item.notes === "string" && item.notes.length <= 2_000);
}

function validTravelReferences(value: unknown): boolean {
  const kinds = new Set(["map-list", "spreadsheet", "guide", "booking", "other"]);
  return Array.isArray(value) && hasUniqueIds(value) && value.every((item) => isRecord(item) && hasOnlyKeys(item, TRAVEL_REFERENCE_FIELDS)
    && isText(item.id, 160) && isText(item.label, 200) && kinds.has(String(item.kind)) && isHttpUrl(item.url)
    && typeof item.description === "string" && item.description.length <= 1_000);
}

function validFlightAllowanceSemantics(value: Record<string, unknown>): boolean {
  const pieceCount = Number(value.checkedPieceCount);
  const pieceWeight = Number(value.checkedPieceWeightKg);
  const totalWeight = Number(value.checkedTotalWeightKg);
  const checkedValid = value.checkedMode === "piece"
    ? Number.isInteger(pieceCount) && pieceCount > 0 && pieceWeight > 0 && totalWeight === 0
    : value.checkedMode === "weight"
      ? pieceCount === 0 && pieceWeight === 0 && totalWeight > 0
      : (value.checkedMode === "none" || value.checkedMode === "unknown") && pieceCount === 0 && pieceWeight === 0 && totalWeight === 0;
  const itemRuleValid = (mode: unknown, countValue: unknown, weightValue: unknown) => {
    const count = Number(countValue);
    const weight = Number(weightValue);
    return mode === "piece" ? Number.isInteger(count) && count > 0 && weight > 0
      : (mode === "none" || mode === "unknown") && count === 0 && weight === 0;
  };
  const cabinValid = itemRuleValid(value.carryOnMode, value.carryOnPieceCount, value.carryOnPieceWeightKg);
  const personalCount = Number(value.personalItemPieceCount);
  const personalWeight = Number(value.personalItemPieceWeightKg);
  const personalValid = value.personalItemMode === "piece"
    ? Number.isInteger(personalCount) && personalCount > 0 && personalWeight >= 0
    : itemRuleValid(value.personalItemMode, value.personalItemPieceCount, value.personalItemPieceWeightKg);
  const completenessValid = value.confirmed === false || (value.checkedMode !== "unknown" && value.carryOnMode !== "unknown" && value.personalItemMode !== "unknown");
  return checkedValid && cabinValid && personalValid && completenessValid;
}

function validBudgetSemantics(value: Record<string, unknown>, partial = false): boolean {
  const amountIsChanging = Object.prototype.hasOwnProperty.call(value, "amount");
  const basis = value.basis;
  if (partial && !amountIsChanging && basis === undefined) return true;
  if (amountIsChanging && Number(value.amount) > 0) {
    return (basis === "estimate" || basis === "confirmed") && isCurrency(value.currency) && isText(value.sourceLabel, 300) && isDate(value.verifiedAt);
  }
  if (basis === "estimate" || basis === "confirmed") return isText(value.sourceLabel, 300) && isDate(value.verifiedAt);
  return basis === undefined || basis === "unset";
}

function validatesEntityField(entity: AiProposalEntity, key: string, value: unknown): boolean {
  if (entity === "journey") {
    if (["title", "ownerName", "homeCity", "hostCity", "hostSchool", "program"].includes(key)) return isText(value, 300);
    if (key === "startDate" || key === "endDate") return isDate(value);
    if (key === "orientationDate") return value === "" || isDate(value);
    if (key === "destinations") return isStringArray(value) && value.length > 0 && value.every((item) => item.trim().length > 0);
    return false;
  }
  if (entity === "task") {
    const textFields = new Set(["title", "description", "phase", "status", "priority", "notes", "sourceLabel", "location", "contactName", "contactInfo", "referenceNumber", "result", "templateKind", "timeZone"]);
    if (key === "id") return isText(value, 160);
    if (textFields.has(key) && !isOptionalText(value)) return false;
    if (key === "title") return isText(value, 200);
    if (key === "phase") return new Set(["admission", "visa", "pre-departure", "arrival-72h", "arrival-2w", "semester", "return"]).has(String(value));
    if (key === "status") return new Set(["not-started", "in-progress", "waiting", "done", "not-applicable"]).has(String(value));
    if (key === "priority") return new Set(["high", "medium", "low"]).has(String(value));
    if (key === "templateKind") return value === undefined || new Set(["general", "flight", "course", "visa", "housing", "payment", "school-admin"]).has(String(value));
    if (key === "dueDate" || key === "verifiedAt") return isOptionalDate(value);
    if (key === "scheduledAt") return value === undefined || isLocalDateTime(value);
    if (key === "sourceUrl") return value === undefined || isHttpUrl(value);
    if (key === "predecessorIds") return isStringArray(value);
    if (key === "cost") return value === undefined || isNumber(value);
    if (key === "currency") return value === undefined || isCurrency(value);
    if (key === "checklist") return value === undefined || validChecklist(value);
    if (key === "records") return value === undefined || validRecords(value);
    return textFields.has(key);
  }
  if (entity === "resource") {
    if (key === "id") return isText(value, 160);
    if (key === "title") return isText(value, 200);
    if (["description", "details", "category", "region"].includes(key)) return isText(value, key === "description" ? 4_000 : key === "details" ? 8_000 : 200);
    if (key === "type") return new Set(["official", "school", "city", "experience", "personal"]).has(String(value));
    if (key === "url") return value === "" || isHttpUrl(value);
    if (key === "verifiedAt") return isDate(value);
    if (key === "origin") return new Set(["user-upload", "ai-research", "manual"]).has(String(value));
    if (key === "privacy") return new Set(["private", "shareable"]).has(String(value));
    if (key === "sourceLabel") return isText(value, 300);
    if (key === "searchTags") return isStringArray(value) && value.length <= 20 && value.every((item) => item.trim().length > 0 && item.length <= 80);
    return false;
  }
  if (entity === "resource-intake") {
    if (key === "id") return isText(value, 160);
    if (key === "url") return isSafeIntakeUrl(value);
    if (key === "note") return typeof value === "string" && value.length <= 1_000;
    if (key === "status") return new Set(["pending", "processed"]).has(String(value));
    if (key === "createdAt") return isTimestamp(value);
    return false;
  }
  if (entity === "packing-item") {
    if (key === "id") return isText(value, 160);
    if (["name", "category"].includes(key)) return isText(value, 200);
    if (key === "decision") return new Set(["must", "recommend", "buy-there", "skip"]).has(String(value));
    if (key === "bagId") return typeof value === "string";
    if (key === "quantity" || key === "weightKg") return isNumber(value);
    if (key === "packed") return isBoolean(value);
    if (key === "warning") return isOptionalText(value, 1_000);
    return false;
  }
  if (entity === "bag") {
    if (key === "id") return isText(value, 160);
    if (key === "name") return isText(value, 200);
    if (key === "kind") return new Set(["checked", "carry-on", "personal"]).has(String(value));
    if (key === "limitKg") return isNumber(value);
    if (key === "limitSource") return new Set(["unconfirmed", "ticket", "manual"]).has(String(value));
    return false;
  }
  if (entity === "flight-allowance") {
    if (key === "id") return isText(value, 160);
    if (["label", "airline", "segment", "sourceLabel"].includes(key)) return isText(value, 300);
    if (key === "checkedMode") return new Set(["piece", "weight", "none", "unknown"]).has(String(value));
    if (["checkedPieceCount", "checkedPieceWeightKg", "checkedTotalWeightKg", "carryOnPieceCount", "carryOnPieceWeightKg", "personalItemPieceCount", "personalItemPieceWeightKg"].includes(key)) return isNumber(value);
    if (key === "carryOnMode" || key === "personalItemMode") return new Set(["piece", "none", "unknown"]).has(String(value));
    if (key === "provenance") return new Set(["ticket", "manual"]).has(String(value));
    if (key === "confirmed") return isBoolean(value);
    if (key === "verifiedAt") return isDate(value);
    if (key === "notes") return typeof value === "string" && value.length <= 4_000;
    return false;
  }
  if (entity === "budget-item") {
    if (key === "id") return isText(value, 160);
    if (key === "name") return isText(value, 200);
    if (key === "category") return new Set(["housing", "food", "transport", "arrival", "other"]).has(String(value));
    if (key === "amount") return isNumber(value);
    if (key === "currency") return isCurrency(value);
    if (key === "cadence") return new Set(["once", "monthly"]).has(String(value));
    if (key === "basis") return new Set(["unset", "estimate", "confirmed"]).has(String(value));
    if (key === "paid") return isBoolean(value);
    if (key === "notes") return typeof value === "string" && value.length <= 4_000;
    if (key === "sourceLabel") return typeof value === "string" && value.length <= 300;
    if (key === "verifiedAt") return value === "" || isDate(value);
    return false;
  }
  if (entity === "study-event") {
    if (key === "id") return isText(value, 160);
    if (key === "title") return isText(value, 200);
    if (key === "kind") return new Set(["class", "exam", "deadline", "orientation", "personal"]).has(String(value));
    if (key === "startDate") return isDate(value);
    if (key === "endDate") return isOptionalDate(value);
    if (key === "startTime" || key === "endTime") return value === undefined || isClockTime(value);
    if (key === "location") return isOptionalText(value, 500);
    if (key === "repeatWeekly" || key === "mandatory") return isBoolean(value);
    if (key === "notes") return typeof value === "string" && value.length <= 4_000;
    return false;
  }
  if (key === "id") return isText(value, 160);
  if (key === "kind") return value === "travel";
  if (key === "title") return isText(value, 200);
  if (key === "destinations") return isStringArray(value) && value.length > 0;
  if (key === "startDate" || key === "endDate") return isDate(value);
  if (key === "travelers" || key === "notes") return typeof value === "string" && value.length <= 4_000;
  if (key === "budget") return isNumber(value);
  if (key === "currency") return isCurrency(value);
  if (key === "days") return validTravelDays(value);
  if (key === "stays") return validTravelStays(value);
  if (key === "references") return validTravelReferences(value);
  if (key === "travelNotes") return validTravelNotes(value);
  if (key === "packingItems") return validTravelPacking(value);
  if (key === "createdAt" || key === "updatedAt") return isTimestamp(value);
  return false;
}

function validatesEntityValue(entity: AiProposalEntity, action: "add" | "update", value: Record<string, unknown>): boolean {
  if (!Object.keys(value).length) return false;
  if (entity === "journey" && action !== "update") return false;
  if (action === "update" && Object.prototype.hasOwnProperty.call(value, "id")) return false;
  const required = entity === "journey" ? []
    : entity === "task" ? ["id", "title", "description", "phase", "status", "priority", "predecessorIds", "notes"]
    : entity === "resource" ? ["id", "title", "description", "details", "category", "type", "url", "verifiedAt", "region", "origin", "privacy", "sourceLabel"]
      : entity === "resource-intake" ? ["id", "url", "note", "status", "createdAt"]
        : entity === "packing-item" ? ["id", "name", "category", "decision", "bagId", "quantity", "weightKg", "packed"]
          : entity === "bag" ? ["id", "name", "kind", "limitKg", "limitSource"]
            : entity === "flight-allowance" ? ["id", "label", "airline", "segment", "checkedMode", "checkedPieceCount", "checkedPieceWeightKg", "checkedTotalWeightKg", "carryOnMode", "carryOnPieceCount", "carryOnPieceWeightKg", "personalItemMode", "personalItemPieceCount", "personalItemPieceWeightKg", "provenance", "confirmed", "sourceLabel", "verifiedAt", "notes"]
              : entity === "budget-item" ? ["id", "name", "category", "amount", "currency", "cadence", "basis", "paid", "notes", "sourceLabel", "verifiedAt"]
                : entity === "study-event" ? ["id", "title", "kind", "startDate", "mandatory", "notes"]
                  : ["id", "kind", "title", "destinations", "startDate", "endDate", "travelers", "budget", "currency", "notes", "days", "stays", "references", "travelNotes", "packingItems", "createdAt", "updatedAt"];
  if (action === "add" && !hasKeys(value, required)) return false;
  if (!Object.entries(value).every(([key, field]) => validatesEntityField(entity, key, field))) return false;
  if (entity === "journey" && typeof value.startDate === "string" && typeof value.endDate === "string" && value.endDate < value.startDate) return false;
  if (entity === "study-event" && typeof value.startDate === "string" && typeof value.endDate === "string" && value.endDate < value.startDate) return false;
  if (entity === "resource" && action === "add") {
    if (value.type !== "personal" && !isHttpUrl(value.url)) return false;
    if (value.type === "personal" && value.privacy !== "private") return false;
  }
  if (entity === "flight-allowance" && action === "add" && !validFlightAllowanceSemantics(value)) return false;
  if (entity === "budget-item" && !validBudgetSemantics(value, action === "update")) return false;
  if (entity === "travel-plan" && typeof value.startDate === "string" && typeof value.endDate === "string") {
    if (value.endDate < value.startDate) return false;
    if (!validTravelDays(value.days, value.startDate, value.endDate)) return false;
  }
  return true;
}

export function validateAiImportBundle(value: unknown): value is AiImportBundle {
  if (!isRecord(value) || !hasOnlyKeys(value, ROOT_FIELDS) || value.schemaVersion !== 1 || !isTimestamp(value.generatedAt) || !isText(value.journeyScope, 300)
    || (value.baseRevision !== undefined && (!Number.isInteger(value.baseRevision) || Number(value.baseRevision) < 1))) return false;
  if (!Array.isArray(value.sources) || !Array.isArray(value.proposals)) return false;
  const serialized = JSON.stringify(value);
  if (serialized.length > 2_000_000 || SECRET_PATTERNS.some((pattern) => pattern.test(serialized))) return false;
  const sourceIds = new Set<string>();
  const sourcesValid = value.sources.every((source) => {
    if (!isRecord(source) || !hasOnlyKeys(source, SOURCE_FIELDS) || !isText(source.id, 160) || !source.id.startsWith("source-") || sourceIds.has(source.id)
      || !isText(source.label, 300) || !SOURCE_KINDS.has(String(source.kind)) || (source.evidenceType !== undefined && !new Set(["general", "ticket"]).has(String(source.evidenceType))) || !isDate(source.capturedAt)
      || (source.url !== undefined && !isHttpUrl(source.url)) || (source.note !== undefined && (typeof source.note !== "string" || source.note.length > 1_000))) return false;
    sourceIds.add(source.id);
    return true;
  });
  if (!sourcesValid) return false;
  const proposalIds = new Set<string>();
  const sourceMap = new Map((value.sources as Array<Record<string, unknown>>).map((source) => [source.id, source]));
  return value.proposals.every((proposal) => {
    if (!isRecord(proposal) || !hasOnlyKeys(proposal, PROPOSAL_FIELDS) || !isText(proposal.id, 180) || !proposal.id.startsWith("proposal-") || proposalIds.has(proposal.id)
      || !isText(proposal.title, 200) || !isText(proposal.summary, 1_000) || !ENTITIES.has(proposal.entity as AiProposalEntity)
      || !ACTIONS.has(String(proposal.action)) || !CONFIDENCE.has(String(proposal.confidence)) || !PRIVACY.has(String(proposal.privacy))
      || !STATUSES.has(String(proposal.status)) || !isRecord(proposal.value) || !Array.isArray(proposal.evidenceIds)
      || !proposal.evidenceIds.length || !proposal.evidenceIds.every((id) => typeof id === "string" && sourceIds.has(id))
      || (proposal.action === "update" && !isText(proposal.targetId, 160))
      || (proposal.action === "add" && proposal.targetId !== undefined)
      || !validatesEntityValue(proposal.entity as AiProposalEntity, proposal.action as "add" | "update", proposal.value)
      || (proposal.entity === "journey" && proposal.privacy !== "private")
      || (proposal.entity === "resource-intake" && proposal.privacy !== "private")
      || (proposal.entity === "budget-item" && proposal.privacy !== "private")
      || (proposal.entity === "resource" && proposal.value.privacy !== undefined && proposal.privacy !== proposal.value.privacy)
      || (proposal.entity === "resource" && proposal.action === "add" && (proposal.value.origin === "manual"
        || (proposal.value.origin === "user-upload" && (proposal.value.privacy !== "private" || !proposal.evidenceIds.some((id) => ["file", "email"].includes(String(sourceMap.get(id)?.kind)))))
        || (proposal.value.origin === "ai-research" && !proposal.evidenceIds.some((id) => ["official", "school", "city", "research", "video"].includes(String(sourceMap.get(id)?.kind))))))
      || (proposal.entity === "flight-allowance" && (proposal.value.provenance !== "ticket" || !proposal.evidenceIds.some((id) => {
        const source = sourceMap.get(id);
        return source?.evidenceType === "ticket" && (source.kind === "file" || source.kind === "email");
      })))
      || (proposal.entity === "bag" && proposal.value.limitSource === "ticket" && !proposal.evidenceIds.some((id) => {
        const source = sourceMap.get(id);
        return source?.evidenceType === "ticket" && (source.kind === "file" || source.kind === "email");
      }))) return false;
    proposalIds.add(proposal.id);
    return true;
  });
}

export function importAiBundle(state: AppState, bundle: AiImportBundle, cloudRunId?: string): AppState {
  const existingSources = new Map((state.aiInbox?.sources ?? []).map((source) => [source.id, source]));
  bundle.sources.forEach((source) => { if (!existingSources.has(source.id)) existingSources.set(source.id, source); });
  const existingProposals = new Map((state.aiInbox?.proposals ?? []).map((proposal) => [proposal.id, proposal]));
  bundle.proposals.forEach((proposal) => {
    if (existingProposals.has(proposal.id)) return;
    if (proposal.action === "add" && isRecord(proposal.value) && typeof proposal.value.id === "string") {
      existingProposals.forEach((existing, id) => {
        if (existing.status !== "pending" || existing.entity !== proposal.entity || existing.action !== "add" || !isRecord(existing.value) || existing.value.id !== proposal.value.id) return;
        const isStrictSuperset = Object.keys(existing.value).every((key) => Object.prototype.hasOwnProperty.call(proposal.value, key) && JSON.stringify(proposal.value[key]) === JSON.stringify(existing.value[key]))
          && Object.keys(proposal.value).length > Object.keys(existing.value).length;
        if (isStrictSuperset) existingProposals.set(id, { ...existing, status: "dismissed" });
      });
    }
    const target = proposal.action === "update" && proposal.targetId
      ? entityItems(state, proposal.entity).find((item) => item.id === proposal.targetId) as Record<string, unknown> | undefined
      : undefined;
    const changedFields = Object.keys(proposal.value);
    const baselineValue = Object.fromEntries(changedFields
      .filter((field) => target && Object.prototype.hasOwnProperty.call(target, field))
      .map((field) => [field, target?.[field]]));
    const baselineAbsentFields = changedFields.filter((field) => !target || !Object.prototype.hasOwnProperty.call(target, field));
    existingProposals.set(proposal.id, {
      ...proposal,
      status: "pending",
      baseRevision: bundle.baseRevision,
      baselineValue,
      baselineAbsentFields,
      cloudRunId,
      createdAt: bundle.generatedAt,
    });
  });
  const importedAt = new Date().toISOString();
  return {
    ...state,
    homeExperience: {
      mode: "dashboard",
      workflow: "ai",
      tutorialVersion: state.homeExperience?.tutorialVersion ?? 1,
      starterPromptCopiedAt: state.homeExperience?.starterPromptCopiedAt,
      activatedAt: state.homeExperience?.activatedAt ?? importedAt,
    },
    aiInbox: {
      lastImportedAt: importedAt,
      journeyScope: bundle.journeyScope,
      sources: [...existingSources.values()],
      proposals: [...existingProposals.values()],
    },
  };
}

export function journeyScopeForState(state: AppState): string {
  return `exchange:${state.journey.id}`;
}

export function matchesAiJourneyScope(state: AppState, bundle: AiImportBundle): boolean {
  return bundle.journeyScope === journeyScopeForState(state);
}

export function findAiBundleCollisions(state: AppState, bundle: AiImportBundle): string[] {
  const sourceIds = new Set((state.aiInbox?.sources ?? []).map((source) => source.id));
  const proposalIds = new Set((state.aiInbox?.proposals ?? []).map((proposal) => proposal.id));
  return [
    ...bundle.sources.filter((source) => sourceIds.has(source.id)).map((source) => `source:${source.id}`),
    ...bundle.proposals.filter((proposal) => proposalIds.has(proposal.id)).map((proposal) => `proposal:${proposal.id}`),
  ];
}

export function sensitiveBundleWarnings(bundle: AiImportBundle): string[] {
  const serialized = JSON.stringify(bundle);
  const warnings = [];
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(serialized)) warnings.push("Email 地址");
  if (/\b\d{8,}\b/.test(serialized)) warnings.push("長數字／可能的帳號或參考號碼");
  if (/(?:passport|booking|reference|account number|postal address|護照|訂位|付款編號|參考號碼|完整住址)/i.test(serialized)) warnings.push("證件、訂位、付款或住址關鍵字");
  const longExcerpt = [...serialized.matchAll(/"([^"\\]|\\.){600,}"/g)].length > 0;
  if (longExcerpt) warnings.push("可能的長篇原文摘錄");
  return warnings;
}

function addOrUpdate<T extends { id: string }>(items: T[], proposal: AiProposal): T[] {
  if (proposal.action === "add") {
    const candidate = proposal.value as unknown as T;
    if (!candidate.id || items.some((item) => item.id === candidate.id)) return items;
    return [...items, candidate];
  }
  if (!proposal.targetId) return items;
  return items.map((item) => item.id === proposal.targetId ? { ...item, ...proposal.value, id: item.id } : item);
}

function entityItems(state: AppState, entity: AiProposalEntity): Array<{ id: string }> {
  if (entity === "journey") return [state.journey];
  if (entity === "task") return state.tasks;
  if (entity === "resource") return state.resources;
  if (entity === "resource-intake") return state.resourceIntake ?? [];
  if (entity === "packing-item") return state.packingItems;
  if (entity === "bag") return state.bags;
  if (entity === "flight-allowance") return state.flightAllowances ?? [];
  if (entity === "budget-item") return state.budget;
  if (entity === "study-event") return state.studyEvents ?? [];
  return state.travelPlans ?? [];
}

export function canApplyAiProposal(state: AppState, proposal: AiProposal, currentRevision?: number): { valid: boolean; reason?: string } {
  if (proposal.baseRevision !== undefined && currentRevision !== undefined && proposal.baseRevision !== currentRevision) {
    const items = entityItems(state, proposal.entity);
    if (proposal.action === "add") {
      const newId = String(proposal.value.id ?? "");
      if (!newId || items.some((item) => item.id === newId)) return { valid: false, reason: "手帳更新後已出現相同項目，請重新核對提案。" };
    } else {
      const current = items.find((item) => item.id === proposal.targetId) as Record<string, unknown> | undefined;
      const baseline = proposal.baselineValue;
      const absent = new Set(proposal.baselineAbsentFields ?? []);
      const fieldsUnchanged = current && baseline && Object.keys(proposal.value).every((field) => absent.has(field)
        ? !Object.prototype.hasOwnProperty.call(current, field)
        : Object.prototype.hasOwnProperty.call(baseline, field) && equalValue(current[field], baseline[field]));
      if (!fieldsUnchanged) return { valid: false, reason: `這筆提案依據雲端版本 ${proposal.baseRevision}，手帳目前是版本 ${currentRevision}，而且缺少可確認欄位未變的快照。請查看差異後，以目前手帳重新核對。` };
    }
  }
  if (!validatesEntityValue(proposal.entity, proposal.action, proposal.value)) return { valid: false, reason: "提案欄位格式或值不符合目前網站資料結構。" };
  const items = entityItems(state, proposal.entity);
  if (proposal.action === "update" && (!proposal.targetId || !items.some((item) => item.id === proposal.targetId))) return { valid: false, reason: "找不到要更新的原始項目，請重新整理提案。" };
  const newId = proposal.action === "add" ? String(proposal.value.id ?? "") : "";
  if (proposal.action === "add" && (!newId || items.some((item) => item.id === newId))) return { valid: false, reason: "新增項目的 ID 已存在或缺少，請重新產生提案。" };
  if (proposal.entity === "packing-item" && typeof proposal.value.bagId === "string" && proposal.value.bagId && !state.bags.some((bag) => bag.id === proposal.value.bagId)) return { valid: false, reason: "提案指定的行李不存在，請改成未分配或重新產生提案。" };
  const current = proposal.action === "update" ? items.find((item) => item.id === proposal.targetId) : undefined;
  const prospective = current ? { ...current, ...proposal.value } : proposal.value;
  const evidence = proposal.evidenceIds.map((id) => state.aiInbox?.sources.find((source) => source.id === id)).filter(Boolean);
  if (proposal.entity === "journey" && typeof prospective.startDate === "string" && typeof prospective.endDate === "string" && prospective.endDate < prospective.startDate) return { valid: false, reason: "交換結束日期早於開始日期。" };
  if (proposal.entity === "study-event" && typeof prospective.startDate === "string" && typeof prospective.endDate === "string" && prospective.endDate < prospective.startDate) return { valid: false, reason: "結束日期早於開始日期。" };
  if (proposal.entity === "travel-plan" && typeof prospective.startDate === "string" && typeof prospective.endDate === "string") {
    if (prospective.endDate < prospective.startDate) return { valid: false, reason: "旅行結束日期早於開始日期。" };
    if (prospective.days !== undefined && !validTravelDays(prospective.days, prospective.startDate, prospective.endDate)) return { valid: false, reason: "旅行日期、每日內容或巢狀 ID 不符合目前行程。" };
  }
  if (proposal.entity === "flight-allowance" && (!validFlightAllowanceSemantics(prospective) || prospective.provenance !== "ticket"
    || !evidence.some((source) => source?.evidenceType === "ticket" && (source.kind === "file" || source.kind === "email")))) return { valid: false, reason: "機票行李規則必須引用本人明確授權的機票檔案或信件，且計件／計重欄位需一致。" };
  if (proposal.entity === "bag" && prospective.limitSource === "ticket"
    && !evidence.some((source) => source?.evidenceType === "ticket" && (source.kind === "file" || source.kind === "email"))) return { valid: false, reason: "標示為機票額度的行李必須引用已授權的機票證據。" };
  if (proposal.entity === "resource" && prospective.type !== "personal" && !isHttpUrl(prospective.url)) return { valid: false, reason: "公開／官方資源必須保留可開啟的 HTTP(S) 來源。" };
  if (proposal.entity === "resource" && prospective.type === "personal" && prospective.privacy !== "private") return { valid: false, reason: "使用者上傳資料提煉的資源必須保持私人。" };
  if (proposal.entity === "resource-intake" && proposal.privacy !== "private") return { valid: false, reason: "待辨識網址在處理前必須保持私人。" };
  if (proposal.entity === "budget-item" && proposal.privacy !== "private") return { valid: false, reason: "個人預算提案必須保持私人。" };
  if (proposal.entity === "budget-item" && !validBudgetSemantics(prospective)) return { valid: false, reason: "預算金額必須附上幣別、依據狀態、來源標籤與查核日期；沒有證據時請保留待設定。" };
  if (proposal.entity === "task" && Array.isArray(prospective.predecessorIds)) {
    const taskIds = new Set(state.tasks.map((task) => task.id));
    if (!prospective.predecessorIds.every((id) => typeof id === "string" && taskIds.has(id))) return { valid: false, reason: "提案包含不存在的前置任務。請先加入前置任務或重新產生提案。" };
  }
  return { valid: true };
}

export function rebaseAiProposal(state: AppState, proposalId: string, currentRevision: number): AppState {
  const proposal = state.aiInbox?.proposals.find((item) => item.id === proposalId);
  if (!proposal || proposal.status !== "pending" || !Number.isInteger(currentRevision) || currentRevision < 1) return state;
  const target = proposal.action === "update" && proposal.targetId
    ? entityItems(state, proposal.entity).find((item) => item.id === proposal.targetId) as Record<string, unknown> | undefined
    : undefined;
  if (proposal.action === "update" && !target) return state;
  const changedFields = Object.keys(proposal.value);
  const baselineValue = Object.fromEntries(changedFields
    .filter((field) => target && Object.prototype.hasOwnProperty.call(target, field))
    .map((field) => [field, target?.[field]]));
  const baselineAbsentFields = changedFields.filter((field) => !target || !Object.prototype.hasOwnProperty.call(target, field));
  return {
    ...state,
    aiInbox: {
      ...(state.aiInbox ?? { sources: [], proposals: [] }),
      proposals: (state.aiInbox?.proposals ?? []).map((item) => item.id === proposalId
        ? { ...item, baseRevision: currentRevision, baselineValue, baselineAbsentFields }
        : item),
    },
  };
}

export function applyAiProposal(state: AppState, proposalId: string, currentRevision?: number): AppState {
  const proposal = state.aiInbox?.proposals.find((item) => item.id === proposalId);
  if (!proposal || proposal.status !== "pending") return state;
  if (!canApplyAiProposal(state, proposal, currentRevision).valid) return state;
  let next = state;
  const currentEntity = proposal.action === "update" && proposal.targetId
    ? entityItems(state, proposal.entity).find((item) => item.id === proposal.targetId)
    : undefined;
  if (proposal.entity === "journey") next = { ...next, journey: { ...next.journey, ...proposal.value, id: next.journey.id, kind: next.journey.kind } as Journey };
  if (proposal.entity === "task") next = { ...next, tasks: addOrUpdate<JourneyTask>(next.tasks, proposal) };
  if (proposal.entity === "resource") next = { ...next, resources: addOrUpdate<ResourceItem>(next.resources, proposal) };
  if (proposal.entity === "resource-intake") {
    const updated = addOrUpdate<ResourceIntake>(next.resourceIntake ?? [], proposal);
    next = {
      ...next,
      resourceIntake: updated.map((item) => item.id === (proposal.targetId ?? proposal.value.id)
        ? stampProcessedResourceIntake(item)
        : item),
    };
  }
  if (proposal.entity === "packing-item") next = { ...next, packingItems: addOrUpdate<PackingItem>(next.packingItems, proposal) };
  if (proposal.entity === "bag") next = { ...next, bags: addOrUpdate<Bag>(next.bags, proposal) };
  if (proposal.entity === "flight-allowance") next = { ...next, flightAllowances: addOrUpdate<FlightAllowance>(next.flightAllowances ?? [], proposal) };
  if (proposal.entity === "budget-item") next = { ...next, budget: addOrUpdate<BudgetItem>(next.budget, proposal) };
  if (proposal.entity === "study-event") next = { ...next, studyEvents: addOrUpdate<StudyEvent>(next.studyEvents ?? [], proposal) };
  if (proposal.entity === "travel-plan") next = { ...next, travelPlans: addOrUpdate<TravelPlan>(next.travelPlans ?? [], proposal) };
  return {
    ...next,
    aiInbox: {
      ...(next.aiInbox ?? { sources: [], proposals: [] }),
      proposals: (next.aiInbox?.proposals ?? []).map((item) => item.id === proposalId ? {
        ...item,
        status: "applied",
        previousValue: currentEntity ? { ...currentEntity } : undefined,
        appliedAt: new Date().toISOString(),
      } : item),
    },
  };
}

function removeById<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}

function equalValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function canUndoAiProposal(state: AppState, proposal: AiProposal): { valid: boolean; reason?: string } {
  if (proposal.status !== "applied") return { valid: false, reason: "這筆提案尚未套用。" };
  const entityId = proposal.action === "add" ? String(proposal.value.id ?? "") : proposal.targetId ?? "";
  const current = entityItems(state, proposal.entity).find((item) => item.id === entityId) as Record<string, unknown> | undefined;
  if (!current) return { valid: false, reason: "找不到已套用的項目。" };
  if (proposal.action === "add" && !equalValue(current, proposal.value)) return { valid: false, reason: "這個項目套用後又被手動修改，為避免刪掉新紀錄，請手動處理。" };
  if (proposal.action === "update" && Object.entries(proposal.value).some(([key, value]) => !equalValue(current[key], value))) return { valid: false, reason: "這些欄位套用後又被手動修改，為避免覆蓋新紀錄，請手動處理。" };
  if (proposal.action === "update" && !proposal.previousValue) return { valid: false, reason: "找不到套用前的欄位紀錄。" };
  return { valid: true };
}

function restorePatchedFields<T extends { id: string }>(items: T[], proposal: AiProposal): T[] {
  return items.map((item) => {
    if (item.id !== proposal.targetId || !proposal.previousValue) return item;
    const restored = { ...item } as Record<string, unknown>;
    for (const key of Object.keys(proposal.value)) {
      if (Object.prototype.hasOwnProperty.call(proposal.previousValue, key)) restored[key] = proposal.previousValue[key];
      else delete restored[key];
    }
    return restored as T;
  });
}

export function undoAiProposal(state: AppState, proposalId: string): AppState {
  const proposal = state.aiInbox?.proposals.find((item) => item.id === proposalId);
  if (!proposal || proposal.status !== "applied") return state;
  if (!canUndoAiProposal(state, proposal).valid) return state;
  const entityId = proposal.action === "add" ? String(proposal.value.id ?? "") : proposal.targetId ?? "";
  if (!entityId) return state;
  const revert = <T extends { id: string }>(items: T[]) => proposal.action === "add"
    ? removeById(items, entityId)
    : restorePatchedFields(items, proposal);
  let next = state;
  if (proposal.entity === "journey") next = { ...next, journey: restorePatchedFields<Journey>([next.journey], proposal)[0] };
  if (proposal.entity === "task") next = { ...next, tasks: revert(next.tasks) };
  if (proposal.entity === "resource") next = { ...next, resources: revert(next.resources) };
  if (proposal.entity === "resource-intake") next = {
    ...next,
    resourceIntake: revert(next.resourceIntake ?? []).map((item) => item.status === "pending" && item.processedAt
      ? { ...item, processedAt: undefined }
      : item),
  };
  if (proposal.entity === "packing-item") next = { ...next, packingItems: revert(next.packingItems) };
  if (proposal.entity === "bag") next = { ...next, bags: revert(next.bags) };
  if (proposal.entity === "flight-allowance") next = { ...next, flightAllowances: revert(next.flightAllowances ?? []) };
  if (proposal.entity === "budget-item") next = { ...next, budget: revert(next.budget) };
  if (proposal.entity === "study-event") next = { ...next, studyEvents: revert(next.studyEvents ?? []) };
  if (proposal.entity === "travel-plan") next = { ...next, travelPlans: revert(next.travelPlans ?? []) };
  return {
    ...next,
    aiInbox: {
      ...(next.aiInbox ?? { sources: [], proposals: [] }),
      proposals: (next.aiInbox?.proposals ?? []).map((item) => item.id === proposalId ? {
        ...item,
        status: "pending",
        previousValue: undefined,
        appliedAt: undefined,
      } : item),
    },
  };
}

export function dismissAiProposal(state: AppState, proposalId: string): AppState {
  if (!state.aiInbox) return state;
  return {
    ...state,
    aiInbox: {
      ...state.aiInbox,
      proposals: state.aiInbox.proposals.map((item) => item.id === proposalId ? { ...item, status: "dismissed" } : item),
    },
  };
}

export function clearDismissedAiProposals(state: AppState): AppState {
  if (!state.aiInbox) return state;
  const proposals = state.aiInbox.proposals.filter((item) => item.status !== "dismissed");
  const usedSources = new Set(proposals.flatMap((proposal) => proposal.evidenceIds));
  return {
    ...state,
    aiInbox: {
      ...state.aiInbox,
      proposals,
      sources: state.aiInbox.sources.filter((source) => usedSources.has(source.id)),
    },
  };
}

export function pruneExpiredAiHistory(state: AppState, now = Date.now()): AppState {
  if (!state.aiInbox) return state;
  const fallback = state.aiInbox.lastImportedAt ? Date.parse(state.aiInbox.lastImportedAt) : now;
  const proposals = state.aiInbox.proposals.filter((proposal) => {
    if (proposal.status === "pending" || proposal.status === "dismissed") {
      const created = proposal.createdAt ? Date.parse(proposal.createdAt) : fallback;
      return !Number.isFinite(created) || now - created <= 5 * 86_400_000;
    }
    if (proposal.status === "applied") {
      const applied = proposal.appliedAt ? Date.parse(proposal.appliedAt) : now;
      return !Number.isFinite(applied) || now - applied <= 7 * 86_400_000;
    }
    return false;
  });
  if (proposals.length === state.aiInbox.proposals.length) return state;
  const usedSources = new Set(proposals.flatMap((proposal) => proposal.evidenceIds));
  return { ...state, aiInbox: { ...state.aiInbox, proposals, sources: state.aiInbox.sources.filter((source) => usedSources.has(source.id)) } };
}
