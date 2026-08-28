import { publicTravelPayload } from "./travel-cloud";
import type {
  TravelActivity,
  TravelDay,
  TravelPackingItem,
  TravelPlan,
  TravelReference,
  TravelStay,
  TravelTransferBundle,
} from "./types";

export const MAX_TRAVEL_TRANSFER_BYTES = 2_000_000;

const transferFields = new Set(["schemaVersion", "kind", "exportedAt", "trip"]);
const planFields = new Set(["id", "kind", "title", "destinations", "startDate", "endDate", "travelers", "budget", "currency", "notes", "days", "stays", "references", "travelNotes", "packingItems", "createdAt", "updatedAt", "cloud"]);
const dayFields = new Set(["id", "date", "title", "activities"]);
const activityFields = new Set(["id", "time", "title", "kind", "location", "mapsUrl", "durationMinutes", "cost", "booked", "notes", "imageUrl", "imageAlt", "imageSourceLabel", "imageSourceUrl"]);
const stayFields = new Set(["id", "name", "checkIn", "checkOut", "area", "address", "mapsUrl", "sourceUrl", "imageUrl", "imageAlt", "summary", "highlights", "notes"]);
const referenceFields = new Set(["id", "label", "kind", "url", "description"]);
const noteFields = new Set(["id", "title", "details", "category", "important", "date", "priority"]);
const packingFields = new Set(["id", "name", "category", "quantity", "packed", "notes"]);
const blockedParam = /(?:^|[_-])(?:access[_-]?token|api[_-]?key|apikey|auth|key|password|secret|signature|token)(?:$|[_-])/i;

type RecordValue = Record<string, unknown>;

export type TravelMergeGroup = "basic" | "activities" | "stays" | "references" | "notes" | "packing";

export interface TravelMergeStat {
  added: number;
  kept: number;
  conflicts: number;
  ignored: number;
}

export type TravelMergeSummary = Record<TravelMergeGroup, TravelMergeStat>;

export interface TravelMergePreview {
  plan: TravelPlan;
  summary: TravelMergeSummary;
  targetId?: string;
  match: "id" | "dates-and-destination" | "new";
}

export type TravelTransferParseResult =
  | { valid: true; trip: TravelPlan; legacy: boolean }
  | { valid: false; reason: string };

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasOnly(value: RecordValue, fields: Set<string>): boolean {
  return Object.keys(value).every((key) => fields.has(key));
}

function text(value: unknown, max: number, allowEmpty = false): value is string {
  return typeof value === "string" && value.length <= max && (allowEmpty || value.trim().length > 0);
}

function number(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && value.includes("T") && !Number.isNaN(Date.parse(value));
}

export function isSafeTravelUrl(value: unknown, allowEmpty = true): value is string {
  if (allowEmpty && value === "") return true;
  if (typeof value !== "string" || value.length > 4_000) return false;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol)
      && !url.username
      && !url.password
      && ![...url.searchParams.keys()].some((key) => blockedParam.test(key));
  } catch {
    return false;
  }
}

function optionalUrl(value: unknown): value is string | undefined {
  return value === undefined || isSafeTravelUrl(value);
}

function optionalText(value: unknown, max: number): value is string | undefined {
  return value === undefined || text(value, max, true);
}

function uniqueIds(items: RecordValue[]): boolean {
  const ids = items.map((item) => item.id);
  return ids.every((id) => text(id, 160)) && new Set(ids).size === ids.length;
}

function validActivity(value: unknown): value is TravelActivity {
  if (!isRecord(value) || !hasOnly(value, activityFields)) return false;
  return text(value.id, 160)
    && text(value.time, 40)
    && text(value.title, 200)
    && new Set(["place", "food", "transport", "stay", "note"]).has(String(value.kind))
    && text(value.location, 500, true)
    && optionalUrl(value.mapsUrl)
    && number(value.durationMinutes)
    && number(value.cost)
    && typeof value.booked === "boolean"
    && text(value.notes, 4_000, true)
    && optionalUrl(value.imageUrl)
    && optionalText(value.imageAlt, 500)
    && optionalText(value.imageSourceLabel, 300)
    && optionalUrl(value.imageSourceUrl);
}

function validDay(value: unknown, startDate: string, endDate: string): value is TravelDay {
  if (!isRecord(value) || !hasOnly(value, dayFields) || !Array.isArray(value.activities)) return false;
  const activities = value.activities.filter(isRecord);
  return activities.length === value.activities.length
    && uniqueIds(activities)
    && text(value.id, 160)
    && isoDate(value.date)
    && value.date >= startDate
    && value.date <= endDate
    && text(value.title, 200)
    && value.activities.every(validActivity);
}

function validStay(value: unknown): value is TravelStay {
  if (!isRecord(value) || !hasOnly(value, stayFields)) return false;
  return text(value.id, 160)
    && text(value.name, 200)
    && isoDate(value.checkIn)
    && isoDate(value.checkOut)
    && value.checkOut >= value.checkIn
    && text(value.area, 500, true)
    && text(value.address, 1_000, true)
    && isSafeTravelUrl(value.mapsUrl)
    && isSafeTravelUrl(value.sourceUrl)
    && isSafeTravelUrl(value.imageUrl)
    && text(value.imageAlt, 500, true)
    && text(value.summary, 2_000)
    && Array.isArray(value.highlights)
    && value.highlights.length <= 12
    && value.highlights.every((item) => text(item, 200))
    && text(value.notes, 2_000, true);
}

function validReference(value: unknown): value is TravelReference {
  if (!isRecord(value) || !hasOnly(value, referenceFields)) return false;
  return text(value.id, 160)
    && text(value.label, 200)
    && new Set(["map-list", "spreadsheet", "guide", "booking", "other"]).has(String(value.kind))
    && isSafeTravelUrl(value.url, false)
    && text(value.description, 1_000, true);
}

function validNote(value: unknown): boolean {
  if (!isRecord(value) || !hasOnly(value, noteFields)) return false;
  return text(value.id, 160)
    && text(value.title, 200)
    && text(value.details, 4_000, true)
    && new Set(["transport", "booking", "safety", "food", "shopping", "general"]).has(String(value.category))
    && typeof value.important === "boolean"
    && (value.date === undefined || isoDate(value.date))
    && (value.priority === undefined || new Set(["low", "medium", "high"]).has(String(value.priority)));
}

function validPacking(value: unknown): value is TravelPackingItem {
  if (!isRecord(value) || !hasOnly(value, packingFields)) return false;
  return text(value.id, 160)
    && text(value.name, 200)
    && text(value.category, 100)
    && number(value.quantity)
    && typeof value.packed === "boolean"
    && text(value.notes, 2_000, true);
}

export function validateTravelPlan(value: unknown): value is TravelPlan {
  if (!isRecord(value) || !hasOnly(value, planFields)) return false;
  if (!text(value.id, 160) || value.kind !== "travel" || !text(value.title, 200)
    || !Array.isArray(value.destinations) || !value.destinations.length || !value.destinations.every((item) => text(item, 200))
    || !isoDate(value.startDate) || !isoDate(value.endDate) || value.endDate < value.startDate
    || !text(value.travelers, 4_000, true) || !number(value.budget) || !text(value.currency, 10)
    || !text(value.notes, 4_000, true) || !timestamp(value.createdAt) || !timestamp(value.updatedAt)) return false;
  if (!Array.isArray(value.days) || !Array.isArray(value.stays ?? []) || !Array.isArray(value.references ?? [])
    || !Array.isArray(value.travelNotes) || !Array.isArray(value.packingItems)) return false;
  const stayValues = (value.stays ?? []) as unknown[];
  const referenceValues = (value.references ?? []) as unknown[];
  const days = value.days.filter(isRecord);
  const stays = stayValues.filter(isRecord);
  const references = referenceValues.filter(isRecord);
  const notes = value.travelNotes.filter(isRecord);
  const packing = value.packingItems.filter(isRecord);
  return days.length === value.days.length && uniqueIds(days) && value.days.every((day) => validDay(day, value.startDate as string, value.endDate as string))
    && stays.length === stayValues.length && uniqueIds(stays) && stayValues.every(validStay)
    && references.length === referenceValues.length && uniqueIds(references) && referenceValues.every(validReference)
    && notes.length === value.travelNotes.length && uniqueIds(notes) && value.travelNotes.every(validNote)
    && packing.length === value.packingItems.length && uniqueIds(packing) && value.packingItems.every(validPacking);
}

export function createTravelTransferBundle(plan: TravelPlan, exportedAt = new Date().toISOString()): TravelTransferBundle {
  return {
    schemaVersion: 1,
    kind: "exchange-companion-travel-transfer",
    exportedAt,
    trip: publicTravelPayload(plan),
  };
}

export function parseTravelTransferText(raw: string): TravelTransferParseResult {
  if (new TextEncoder().encode(raw).byteLength > MAX_TRAVEL_TRANSFER_BYTES) return { valid: false, reason: "檔案超過 2 MB，請先移除內嵌圖片或無關內容。" };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { valid: false, reason: "這不是有效的 JSON 檔案。" };
  }
  const legacy = isRecord(value) && value.kind === "travel";
  if (!legacy) {
    if (!isRecord(value) || !hasOnly(value, transferFields) || value.schemaVersion !== 1
      || value.kind !== "exchange-companion-travel-transfer" || !timestamp(value.exportedAt)) {
      return { valid: false, reason: "找不到可辨識的 Exchange Companion 旅行交換格式。" };
    }
    value = value.trip;
  }
  if (!validateTravelPlan(value)) return { valid: false, reason: "旅行欄位、日期、網址或巢狀資料不符合目前格式。" };
  return { valid: true, trip: publicTravelPayload(value), legacy };
}

function emptyStat(): TravelMergeStat {
  return { added: 0, kept: 0, conflicts: 0, ignored: 0 };
}

function emptySummary(): TravelMergeSummary {
  return { basic: emptyStat(), activities: emptyStat(), stays: emptyStat(), references: emptyStat(), notes: emptyStat(), packing: emptyStat() };
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("zh-TW").replaceAll(/\s+/g, " ");
}

function canonicalUrl(value?: string): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return normalized(value);
  }
}

function sameActivity(left: TravelActivity, right: TravelActivity): boolean {
  if (left.id === right.id) return true;
  if (left.mapsUrl && right.mapsUrl && canonicalUrl(left.mapsUrl) === canonicalUrl(right.mapsUrl)) return left.time === right.time;
  return left.time === right.time && normalized(left.title) === normalized(right.title);
}

function mergeList<T>(local: T[], incoming: T[], duplicate: (left: T, right: T) => boolean, stat: TravelMergeStat): T[] {
  const merged = [...local];
  incoming.forEach((item) => {
    const existing = merged.find((candidate) => duplicate(candidate, item));
    if (!existing) {
      merged.push(item);
      stat.added += 1;
      return;
    }
    stat.kept += 1;
    stat.ignored += 1;
    if (JSON.stringify(existing) !== JSON.stringify(item)) stat.conflicts += 1;
  });
  return merged;
}

function destinationsOverlap(left: TravelPlan, right: TravelPlan): boolean {
  const leftValues = left.destinations.flatMap((item) => normalized(item).split(/[/、,，]/)).filter(Boolean);
  const rightValues = right.destinations.flatMap((item) => normalized(item).split(/[/、,，]/)).filter(Boolean);
  return leftValues.some((item) => rightValues.some((candidate) => candidate.includes(item) || item.includes(candidate)));
}

export function findTravelImportTarget(incoming: TravelPlan, plans: TravelPlan[]): { plan?: TravelPlan; match: TravelMergePreview["match"] } {
  const exact = plans.find((plan) => plan.id === incoming.id);
  if (exact) return { plan: exact, match: "id" };
  const dated = plans.find((plan) => plan.startDate === incoming.startDate && plan.endDate === incoming.endDate && destinationsOverlap(plan, incoming));
  return dated ? { plan: dated, match: "dates-and-destination" } : { match: "new" };
}

export function previewTravelMerge(incoming: TravelPlan, plans: TravelPlan[], now = new Date().toISOString()): TravelMergePreview {
  const summary = emptySummary();
  const target = findTravelImportTarget(incoming, plans);
  if (!target.plan) {
    summary.basic.added = 1;
    summary.activities.added = incoming.days.reduce((count, day) => count + day.activities.length, 0);
    summary.stays.added = (incoming.stays ?? []).length;
    summary.references.added = (incoming.references ?? []).length;
    summary.notes.added = incoming.travelNotes.length;
    summary.packing.added = incoming.packingItems.length;
    return { plan: { ...incoming, updatedAt: now }, summary, match: "new" };
  }

  const local = target.plan;
  const basicPairs: Array<[unknown, unknown]> = [
    [local.title, incoming.title], [local.destinations, incoming.destinations], [local.startDate, incoming.startDate],
    [local.endDate, incoming.endDate], [local.travelers, incoming.travelers], [local.budget, incoming.budget],
    [local.currency, incoming.currency], [local.notes, incoming.notes],
  ];
  basicPairs.forEach(([left, right]) => {
    const localHasValue = Array.isArray(left) ? left.length > 0 : typeof left === "number" ? left > 0 : Boolean(left);
    if (localHasValue) {
      summary.basic.kept += 1;
      if (JSON.stringify(left) !== JSON.stringify(right)) summary.basic.conflicts += 1;
    } else if (JSON.stringify(left) !== JSON.stringify(right)) summary.basic.added += 1;
  });

  const incomingByDate = new Map(incoming.days.map((day) => [day.date, day]));
  const mergedDays = local.days.map((day) => {
    const importedDay = incomingByDate.get(day.date);
    if (!importedDay) return day;
    incomingByDate.delete(day.date);
    return {
      ...day,
      title: day.title || importedDay.title,
      activities: mergeList(day.activities, importedDay.activities, sameActivity, summary.activities).sort((a, b) => a.time.localeCompare(b.time)),
    };
  });
  incomingByDate.forEach((day) => {
    mergedDays.push(day);
    summary.activities.added += day.activities.length;
  });
  mergedDays.sort((a, b) => a.date.localeCompare(b.date));

  const stays = mergeList(local.stays ?? [], incoming.stays ?? [], (left, right) => left.id === right.id
    || (normalized(left.name) === normalized(right.name) && left.checkIn === right.checkIn && left.checkOut === right.checkOut)
    || Boolean(left.mapsUrl && right.mapsUrl && canonicalUrl(left.mapsUrl) === canonicalUrl(right.mapsUrl)), summary.stays);
  const references = mergeList(local.references ?? [], incoming.references ?? [], (left, right) => left.id === right.id || canonicalUrl(left.url) === canonicalUrl(right.url), summary.references);
  const travelNotes = mergeList(local.travelNotes, incoming.travelNotes, (left, right) => left.id === right.id || normalized(left.title) === normalized(right.title), summary.notes);
  const packingItems = mergeList(local.packingItems, incoming.packingItems, (left, right) => left.id === right.id || normalized(left.name) === normalized(right.name), summary.packing);

  const chooseIncoming = (localValue: string, incomingValue: string) => localValue.trim() ? localValue : incomingValue;
  const plan: TravelPlan = {
    ...local,
    title: chooseIncoming(local.title, incoming.title),
    destinations: local.destinations.length ? local.destinations : incoming.destinations,
    startDate: local.startDate || incoming.startDate,
    endDate: local.endDate || incoming.endDate,
    travelers: chooseIncoming(local.travelers, incoming.travelers),
    budget: local.budget > 0 ? local.budget : incoming.budget,
    currency: chooseIncoming(local.currency, incoming.currency),
    notes: chooseIncoming(local.notes, incoming.notes),
    days: mergedDays,
    stays,
    references,
    travelNotes,
    packingItems,
    updatedAt: now,
  };
  return { plan, summary, targetId: local.id, match: target.match };
}

export function travelAiPrompt(filename: string): string {
  return `請編輯附件 ${filename} 裡的旅行資料。保留 schemaVersion、kind、旅行 id、既有人工內容與所有未知欄位；只修改我明確要求的旅行內容。請勿加入帳號、token、訂位編號、私人交換資料或 base64 圖片。照片只能使用一般 HTTP(S) 網址，並同時填寫 imageAlt、imageSourceLabel 與 imageSourceUrl。最後只回傳完整 JSON，不要加 Markdown 程式碼框。`;
}

export function travelUrlConciergePrompt(url: string, plan: TravelPlan): string {
  return `請使用 $exchange-concierge，以 targeted 模式處理我已在旅行頁授權的網址：${url}。目標是既有旅行「${plan.title}」（ID：${plan.id}）。只將可由該公開頁面支持的行程、住宿、參考資料、提醒與旅行行李整理成 pending travel-plan 更新提案；保留我現有的標題、日期、同行者、預算、幣別與人工內容，不要直接套用。第三方照片只保留外部網址、替代文字、來源名稱與來源頁面，不下載或重新託管。完成後將對應 resource-intake 標成 processed，並逐面向寫完 coverage。`;
}
