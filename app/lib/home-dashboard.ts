import type { AppState, BudgetItem, StudyEvent } from "./types";

export type HomeAgendaSource = "task" | "study" | "travel" | "journey";

export interface HomeAgendaTarget {
  section: "home" | "journey" | "travel" | "ai" | "settings";
  task?: string;
  trip?: string;
  inbox?: "open";
  guide?: "1";
  hash?: string;
}

export interface HomeAgendaItem {
  id: string;
  source: HomeAgendaSource;
  title: string;
  date: string;
  time?: string;
  detail: string;
  completed?: boolean;
  target: HomeAgendaTarget;
}

export interface HomeBulletinItem {
  id: string;
  priority: number;
  tone: "danger" | "warning" | "info" | "safe";
  title: string;
  summary: string;
  target?: HomeAgendaTarget;
}

export interface BudgetCurrencySummary {
  currency: string;
  amount: number;
}

export interface HomeBudgetSummary {
  monthly: BudgetCurrencySummary[];
  once: BudgetCurrencySummary[];
  basisCounts: Record<BudgetItem["basis"], number>;
}

function dateAtNoon(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

export function shiftHomeDate(date: string, days: number): string {
  const value = dateAtNoon(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function isBetween(date: string, start: string, end: string): boolean {
  return Boolean(date) && date >= start && date <= end;
}

function taskDate(value?: string): string {
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
}

function studyOccurrences(event: StudyEvent, start: string, end: string): string[] {
  const first = event.startDate;
  if (!first) return [];
  if (!event.repeatWeekly) return isBetween(first, start, end) ? [first] : [];
  const results: string[] = [];
  let cursor = first;
  const last = event.endDate && event.endDate >= first ? event.endDate : end;
  while (cursor <= end && cursor <= last) {
    if (cursor >= start) results.push(cursor);
    cursor = shiftHomeDate(cursor, 7);
  }
  return results;
}

export function buildHomeAgenda(state: AppState, today: string, days = 14): HomeAgendaItem[] {
  const end = shiftHomeDate(today, days - 1);
  const items: HomeAgendaItem[] = [];

  state.tasks.forEach((task) => {
    const date = taskDate(task.scheduledAt) || task.dueDate || "";
    if (!isBetween(date, today, end) || task.status === "not-applicable") return;
    items.push({
      id: `task:${task.id}:${date}`,
      source: "task",
      title: task.title,
      date,
      time: task.scheduledAt?.includes("T") ? task.scheduledAt.slice(11, 16) : undefined,
      detail: task.scheduledAt ? "已排定的交換任務" : "任務期限",
      completed: task.status === "done",
      target: { section: "journey", task: task.id },
    });
  });

  (state.studyEvents ?? []).forEach((event) => {
    studyOccurrences(event, today, end).forEach((date) => items.push({
      id: `study:${event.id}:${date}`,
      source: "study",
      title: event.title,
      date,
      time: event.startTime,
      detail: event.kind === "exam" ? "考試" : event.kind === "class" ? "課程" : event.kind === "orientation" ? "Orientation" : "不可撞期行程",
      target: { section: "travel" },
    }));
  });

  (state.travelPlans ?? []).forEach((plan) => {
    if (isBetween(plan.startDate, today, end)) items.push({ id: `travel:${plan.id}:start`, source: "travel", title: `${plan.title}出發`, date: plan.startDate, detail: plan.destinations.join(" · "), target: { section: "travel", trip: plan.id } });
    plan.days.forEach((day) => day.activities.forEach((activity) => {
      if (!isBetween(day.date, today, end)) return;
      items.push({ id: `travel:${plan.id}:${day.id}:${activity.id}`, source: "travel", title: activity.title, date: day.date, time: activity.time, detail: `${plan.title}${activity.location ? ` · ${activity.location}` : ""}`, target: { section: "travel", trip: plan.id } });
    }));
    if (plan.endDate !== plan.startDate && isBetween(plan.endDate, today, end)) items.push({ id: `travel:${plan.id}:end`, source: "travel", title: `${plan.title}返程`, date: plan.endDate, detail: plan.destinations.join(" · "), target: { section: "travel", trip: plan.id } });
  });

  const milestones = [
    { id: "orientation", date: state.journey.orientationDate, title: "交換 Orientation", detail: state.journey.hostSchool || "交換學校" },
    { id: "departure", date: state.journey.startDate, title: "交換旅程出發", detail: `${state.journey.homeCity || "出發地"} → ${state.journey.hostCity || "目的地"}` },
    { id: "return", date: state.journey.endDate, title: "交換旅程結束", detail: "返國與註銷收尾" },
  ];
  milestones.forEach((milestone) => {
    if (!isBetween(milestone.date, today, end)) return;
    items.push({ id: `journey:${milestone.id}`, source: "journey", title: milestone.title, date: milestone.date, detail: milestone.detail, target: { section: "journey" } });
  });

  return [...new Map(items.map((item) => [item.id, item])).values()]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "99:99").localeCompare(b.time ?? "99:99") || a.title.localeCompare(b.title));
}

function eventOverlapsPlan(event: StudyEvent, start: string, end: string): boolean {
  if (event.repeatWeekly) return studyOccurrences(event, start, end).length > 0;
  return event.startDate <= end && (event.endDate ?? event.startDate) >= start;
}

export function buildHomeBulletins(state: AppState, today: string, agentConnected: boolean | null = true): HomeBulletinItem[] {
  const activeTasks = state.tasks.filter((task) => task.status !== "done" && task.status !== "not-applicable");
  const completed = new Set(state.tasks.filter((task) => task.status === "done" || task.status === "not-applicable").map((task) => task.id));
  const bulletins: HomeBulletinItem[] = [];

  const overdueTasks = activeTasks.filter((task) => task.dueDate && task.dueDate < today).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  if (overdueTasks.length) bulletins.push({ id: "overdue-tasks", priority: 1, tone: "danger", title: `${overdueTasks.length} 項任務已逾期`, summary: `最早：${overdueTasks[0].title} · ${overdueTasks[0].dueDate}`, target: { section: "journey", task: overdueTasks[0].id } });
  const blockedTasks = activeTasks.map((task) => ({ task, missing: task.predecessorIds.filter((id) => !completed.has(id)) })).filter((entry) => entry.missing.length > 0);
  if (blockedTasks.length) bulletins.push({ id: "blocked-tasks", priority: 1, tone: "danger", title: `${blockedTasks.length} 項任務被前一步卡住`, summary: `先處理：${blockedTasks[0].task.title}`, target: { section: "journey", task: blockedTasks[0].task.id } });

  const blockingEvents: StudyEvent[] = [
    ...(state.studyEvents ?? []),
    ...activeTasks.filter((task) => task.dueDate && task.priority === "high").map((task) => ({ id: `task-${task.id}`, title: task.title, kind: "deadline" as const, startDate: task.dueDate!, mandatory: true, notes: task.notes })),
  ];
  (state.travelPlans ?? []).forEach((plan) => {
    const conflicts = blockingEvents.filter((event) => eventOverlapsPlan(event, plan.startDate, plan.endDate));
    if (conflicts.length) bulletins.push({ id: `conflict:${plan.id}`, priority: 2, tone: "danger", title: `${plan.title}有 ${conflicts.length} 個撞期`, summary: conflicts.slice(0, 2).map((event) => event.title).join("、"), target: { section: "travel", trip: plan.id } });
  });

  const pending = (state.aiInbox?.proposals ?? []).filter((proposal) => proposal.status === "pending").length;
  if (pending) bulletins.push({ id: "ai-pending", priority: 3, tone: "info", title: `${pending} 筆 AI 更新等你確認`, summary: "AI 不會直接改手帳；請查看來源與欄位差異後再決定。", target: { section: "ai", inbox: "open" } });
  if (state.homeExperience?.workflow === "ai" && agentConnected === false) bulletins.push({ id: "ai-disconnected", priority: 3, tone: "warning", title: "Codex 連結目前未啟用", summary: "手帳不會退回教學，但之後要自動整理時需要重新連結。", target: { section: "ai" } });

  const soon = shiftHomeDate(today, 13);
  activeTasks.filter((task) => (task.dueDate && isBetween(task.dueDate, today, soon)) || task.status === "waiting").forEach((task) => bulletins.push({ id: `soon:${task.id}`, priority: 4, tone: "warning", title: task.status === "waiting" ? `等待中：${task.title}` : `14 天內：${task.title}`, summary: task.dueDate ? `期限 ${task.dueDate}` : "等待外部回覆或下一步。", target: { section: "journey", task: task.id } }));

  const departureDays = state.journey.startDate ? Math.round((dateAtNoon(state.journey.startDate).getTime() - dateAtNoon(today).getTime()) / 86_400_000) : Infinity;
  if (departureDays >= 0 && departureDays <= 30) {
    const allowances = state.flightAllowances ?? [];
    const rulesUnconfirmed = !allowances.length || allowances.some((rule) => !rule.confirmed || [rule.checkedMode, rule.carryOnMode, rule.personalItemMode].includes("unknown"));
    const bagsUnconfirmed = state.bags.some((bag) => bag.limitSource === "unconfirmed");
    if (rulesUnconfirmed || bagsUnconfirmed) bulletins.push({ id: "packing-risk", priority: 5, tone: "warning", title: "出發前還有行李規則待確認", summary: "請依本人機票逐段核對托運、手提與個人物品額度。", target: { section: "journey" } });
  }

  return bulletins.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title)).slice(0, 5);
}

export function summarizeHomeBudget(items: BudgetItem[]): HomeBudgetSummary {
  const summarize = (cadence: BudgetItem["cadence"]) => Object.entries(items.filter((item) => item.cadence === cadence).reduce<Record<string, number>>((totals, item) => ({ ...totals, [item.currency]: (totals[item.currency] ?? 0) + item.amount }), {})).map(([currency, amount]) => ({ currency, amount })).sort((a, b) => a.currency.localeCompare(b.currency));
  return {
    monthly: summarize("monthly"),
    once: summarize("once"),
    basisCounts: items.reduce<HomeBudgetSummary["basisCounts"]>((counts, item) => ({ ...counts, [item.basis]: counts[item.basis] + 1 }), { unset: 0, estimate: 0, confirmed: 0 }),
  };
}
