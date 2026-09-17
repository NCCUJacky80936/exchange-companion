import type { AiProposal, AiUpdateEntry, AppState, NavSection } from "./types";
import type { HomeAgendaTarget } from "./home-dashboard";

export const updateArea = {
  journey: "交換旅程", task: "旅程任務", resource: "生活資源", "resource-intake": "待整理資源",
  "packing-item": "行李物品", bag: "實體行李", "flight-allowance": "行李規則",
  "budget-item": "預算", "study-event": "課程與行程", "travel-plan": "旅行規劃",
} as const;
export const updateStatus = { pending: "待確認", applied: "已套用", dismissed: "已略過", expired: "已到期未套用", reverted: "已復原・待確認" } as const;
const fieldLabels: Record<string, string> = {
  title: "標題", name: "名稱", status: "狀態", dueDate: "期限", startDate: "開始日期", endDate: "結束日期",
  startTime: "開始時間", endTime: "結束時間", notes: "備註", details: "詳細說明", description: "說明",
  amount: "金額", currency: "幣別", quantity: "數量", weightKg: "重量（kg）", location: "地點",
  checklist: "檢查清單", records: "紀錄", days: "每日行程", references: "參考資料", stays: "住宿",
  url: "網址", confirmed: "確認狀態", packed: "打包狀態", paid: "付款狀態", priority: "優先程度",
  orientationDate: "迎新日期", classroom: "教室", teacher: "教師", mandatory: "是否必須參加",
};
const valueLabels: Record<string, string> = { "not-started": "尚未開始", "in-progress": "進行中", waiting: "等待中", done: "已完成", "not-applicable": "不適用", high: "高", medium: "中", low: "低" };
function describe(value: unknown): string {
  if (value === undefined || value === null || value === "") return "未設定";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) return `${value.length} 項：${value.map((item) => typeof item === "object" && item ? item.label ?? item.title ?? item.name ?? "項目" : String(item)).join("、")}`.slice(0, 240);
  if (typeof value === "object") return "內容已調整（詳見項目）";
  return (valueLabels[String(value)] ?? String(value)).slice(0, 240);
}
function changesFor(proposal: AiProposal): AiUpdateEntry["changes"] {
  const before = proposal.previousValue ?? proposal.baselineValue;
  return Object.entries(proposal.value).filter(([field, value]) => field !== "id" && JSON.stringify(before?.[field]) !== JSON.stringify(value))
    .map(([field, value]) => ({ field: fieldLabels[field] ?? field, before: before ? describe(before[field]) : undefined, after: describe(value) }));
}

const entities = new Set(Object.keys(updateArea));
const statuses = new Set(Object.keys(updateStatus));
const sourceKinds = new Set(["official", "school", "city", "email", "file", "video", "research"]);
const timestamp = (value: unknown): string => typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : "";
const text = (value: unknown, max: number): string => typeof value === "string" ? value.slice(0, max) : "";
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

/** Keep the private notebook below its sync ceiling, even after many imports. */
export function normalizeAiActivity(value: unknown): AiUpdateEntry[] {
  if (!Array.isArray(value)) return [];
  const entries = new Map<string, AiUpdateEntry>();
  for (const item of value) {
    if (!record(item) || !text(item.id, 180) || !entities.has(String(item.entity)) || !statuses.has(String(item.status)) || !["add", "update"].includes(String(item.action))) continue;
    const sources = Array.isArray(item.sources) ? item.sources.filter(record).filter((source) => typeof source.id === "string" && typeof source.label === "string" && sourceKinds.has(String(source.kind))).slice(0, 12).map((source) => {
      let url: string | undefined;
      try { if (typeof source.url === "string" && ["http:", "https:"].includes(new URL(source.url).protocol)) url = source.url.slice(0, 1500); } catch { /* Keep the source label without an unsafe URL. */ }
      return { id: text(source.id, 180), label: text(source.label, 180), kind: source.kind as AiUpdateEntry["sources"][number]["kind"], url, capturedAt: text(source.capturedAt, 40) };
    }) : [];
    const changes = Array.isArray(item.changes) ? item.changes.filter(record).slice(0, 16).map((change) => ({ field: text(change.field, 80), before: typeof change.before === "string" ? text(change.before, 240) : undefined, after: text(change.after, 240) })) : [];
    entries.set(text(item.id, 180), {
      id: text(item.id, 180), entity: item.entity as AiUpdateEntry["entity"], action: item.action as AiUpdateEntry["action"],
      targetId: typeof item.targetId === "string" ? text(item.targetId, 180) : undefined,
      title: text(item.title, 240), summary: text(item.summary, 800), privacy: item.privacy === "shareable" ? "shareable" : "private",
      status: item.status as AiUpdateEntry["status"], receivedAt: timestamp(item.receivedAt), updatedAt: timestamp(item.updatedAt), sources, changes,
    });
  }
  let bytes = 0;
  return [...entries.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)).slice(0, 300).filter((entry) => {
    bytes += new TextEncoder().encode(JSON.stringify(entry)).length;
    return bytes <= 600_000;
  });
}

/** Receipt snapshots contain no rollback payloads or full evidence documents. */
export function captureAiUpdates(state: AppState, now?: string): AppState {
  if (!state.aiInbox) return state;
  const inbox = state.aiInbox;
  const entries = new Map(normalizeAiActivity(inbox.activity).map((entry) => [entry.id, entry]));
  for (const proposal of inbox.proposals) {
    const previous = entries.get(proposal.id);
    const reverted = proposal.status === "pending" && (previous?.status === "applied" || previous?.status === "reverted");
    const status = reverted ? "reverted" : proposal.status;
    const receivedAt = previous?.receivedAt ?? now ?? proposal.createdAt ?? inbox.lastImportedAt ?? "";
    const changed = previous && (previous.status !== status || previous.summary !== proposal.summary || previous.title !== proposal.title);
    const updatedAt = changed ? now ?? proposal.appliedAt ?? receivedAt : previous?.updatedAt ?? (proposal.status === "applied" ? proposal.appliedAt ?? receivedAt : receivedAt);
    entries.set(proposal.id, {
      id: proposal.id, entity: proposal.entity, action: proposal.action,
      targetId: proposal.targetId ?? (typeof proposal.value.id === "string" ? proposal.value.id : undefined),
      title: proposal.title, summary: proposal.summary, privacy: proposal.privacy,
      status, receivedAt, updatedAt,
      sources: proposal.evidenceIds.flatMap((id) => {
        const source = inbox.sources.find((item) => item.id === id);
        return source ? [{ id: source.id, label: source.label, kind: source.kind, url: source.url, capturedAt: source.capturedAt }] : previous?.sources.filter((item) => item.id === id) ?? [];
      }),
      changes: reverted && previous ? previous.changes : changesFor(proposal),
    });
  }
  const activity = normalizeAiActivity([...entries.values()]);
  if (JSON.stringify(activity) === JSON.stringify(inbox.activity ?? [])) return state;
  return { ...state, aiInbox: { ...inbox, activity } };
}

export type UpdateScope = "home" | "journey" | "packing" | "travel" | "resources" | "settings" | "ai";
export type UpdatePeriod = "unread" | "today" | "week" | "all";
export function scopeForUpdate(entry: AiUpdateEntry): UpdateScope {
  if (["packing-item", "bag", "flight-allowance"].includes(entry.entity)) return "packing";
  if (["study-event", "travel-plan"].includes(entry.entity)) return "travel";
  if (["resource", "resource-intake"].includes(entry.entity)) return "resources";
  if (entry.entity === "budget-item") return "settings";
  return "journey";
}
export function isUnreadUpdate(entry: AiUpdateEntry, state: AppState, scope: UpdateScope): boolean {
  const readAt = state.aiInbox?.updateReadAt ?? {};
  const seen = [readAt.home, readAt[scopeForUpdate(entry)], readAt[scope]].map(timestamp).filter(Boolean).sort().at(-1) ?? "";
  return !seen || Boolean(entry.updatedAt && Date.parse(entry.updatedAt) > Date.parse(seen));
}
export function selectAiUpdates(state: AppState, scope: UpdateScope, period: UpdatePeriod, now = new Date()): AiUpdateEntry[] {
  const entries = captureAiUpdates(state).aiInbox?.activity ?? [];
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(dayStart); weekStart.setDate(weekStart.getDate() - 6);
  return entries.filter((entry) => (scope === "home" || scope === "ai" || scopeForUpdate(entry) === scope)
    && (period === "all" || period === "unread" && isUnreadUpdate(entry, state, scope)
      || period === "today" && Date.parse(entry.updatedAt) >= dayStart.getTime() && Date.parse(entry.updatedAt) <= now.getTime()
      || period === "week" && Date.parse(entry.updatedAt) >= weekStart.getTime() && Date.parse(entry.updatedAt) <= now.getTime()))
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "") || a.id.localeCompare(b.id));
}
export function markAiUpdatesRead(state: AppState, scope: UpdateScope, at = new Date().toISOString()): AppState {
  if (!state.aiInbox) return state;
  return { ...state, aiInbox: { ...state.aiInbox, updateReadAt: { ...state.aiInbox.updateReadAt, [scope === "ai" ? "home" : scope]: at } } };
}
export function groupAiUpdates(entries: AiUpdateEntry[]): AiUpdateEntry[][] {
  const groups = new Map<string, AiUpdateEntry[]>();
  for (const entry of entries) {
    const key = `${entry.entity}:${entry.targetId ?? entry.id}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.values()];
}
export function targetForUpdate(entry: AiUpdateEntry, state: AppState): HomeAgendaTarget | null {
  if (entry.status === "pending" || entry.status === "reverted") return state.aiInbox?.proposals.some((item) => item.id === entry.id && item.status === "pending") ? { section: "ai", inbox: "open", hash: `proposal-${entry.id}` } : null;
  if (entry.status !== "applied") return null;
  const id = entry.targetId;
  if (entry.entity === "task") return state.tasks.some((item) => item.id === id) ? { section: "journey", task: id } : null;
  if (entry.entity === "travel-plan") return state.travelPlans?.some((item) => item.id === id) ? { section: "travel", trip: id } : null;
  if (entry.entity === "study-event") {
    const event = state.studyEvents?.find((item) => item.id === id);
    return event ? { section: "travel", hash: event.kind === "class" ? "academic-planning" : "academic-conflicts" } : null;
  }
  if (scopeForUpdate(entry) === "packing") return { section: "journey", view: "packing", hash: entry.entity === "flight-allowance" ? "flight-allowances" : `${entry.entity}-${id}` };
  if (entry.entity === "resource") return state.resources.some((item) => item.id === id) ? { section: "resources", hash: `resource-${id}` } : null;
  if (entry.entity === "resource-intake") return { section: "resources" };
  if (entry.entity === "budget-item") return { section: "settings", hash: "budget-settings" };
  return { section: "journey" };
}
export function updateScopeForPage(section: NavSection, packing: boolean): UpdateScope {
  return section === "journey" && packing ? "packing" : section;
}
