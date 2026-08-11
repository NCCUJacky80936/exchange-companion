import { defaultState } from "./default-data";
import { exchangeProfile } from "./profile";
import type { AppState, BudgetItem, FlightAllowance, JourneyPhase, JourneyTask, Priority, TaskStatus, TaskTemplateKind } from "./types";

const LEGACY_STORAGE_KEY = "exchange-companion:v1";
const CURRENT_DATA_REVISION = 5;
const TASK_PHASES = new Set<JourneyPhase>(["admission", "visa", "pre-departure", "arrival-72h", "arrival-2w", "semester", "return"]);
const TASK_STATUSES = new Set<TaskStatus>(["not-started", "in-progress", "waiting", "done", "not-applicable"]);
const TASK_PRIORITIES = new Set<Priority>(["high", "medium", "low"]);
const TASK_TEMPLATES = new Set<TaskTemplateKind>(["general", "flight", "course", "visa", "housing", "payment", "school-admin"]);
const BUDGET_CATEGORIES = new Set<BudgetItem["category"]>(["housing", "food", "transport", "arrival", "other"]);
const BUDGET_BASES = new Set<BudgetItem["basis"]>(["unset", "estimate", "confirmed"]);

function journeyStorageKey(): string {
  const journey = defaultState.journey;
  return `${LEGACY_STORAGE_KEY}:${encodeURIComponent([journey.hostSchool, journey.hostCity, journey.destinations.join(","), journey.startDate, journey.endDate].join("|"))}`;
}

function matchesConfiguredJourney(state: Partial<AppState>): boolean {
  const journey = state.journey;
  const configured = defaultState.journey;
  return Boolean(journey
    && journey.hostSchool === configured.hostSchool
    && journey.hostCity === configured.hostCity
    && journey.destinations.join(",") === configured.destinations.join(",")
    && journey.startDate === configured.startDate
    && journey.endDate === configured.endDate);
}

function cloneDefault(): AppState {
  return JSON.parse(JSON.stringify(defaultState)) as AppState;
}

function normalizeTask(task: JourneyTask, index: number): JourneyTask {
  const candidate = task as Partial<JourneyTask>;
  const checklist = Array.isArray(candidate.checklist) ? candidate.checklist.filter((item) => item && typeof item.id === "string" && typeof item.label === "string").map((item) => ({ ...item, done: Boolean(item.done) })) : [];
  const records = Array.isArray(candidate.records) ? candidate.records.filter((item) => item && typeof item.id === "string" && typeof item.date === "string" && typeof item.note === "string") : [];
  return {
    ...candidate,
    id: typeof candidate.id === "string" && candidate.id ? candidate.id : `recovered-task-${index + 1}`,
    title: typeof candidate.title === "string" && candidate.title ? candidate.title : "待確認任務",
    description: typeof candidate.description === "string" ? candidate.description : "",
    phase: TASK_PHASES.has(candidate.phase as JourneyPhase) ? candidate.phase as JourneyPhase : "pre-departure",
    status: TASK_STATUSES.has(candidate.status as TaskStatus) ? candidate.status as TaskStatus : "not-started",
    priority: TASK_PRIORITIES.has(candidate.priority as Priority) ? candidate.priority as Priority : "medium",
    predecessorIds: Array.isArray(candidate.predecessorIds) ? candidate.predecessorIds.filter((id): id is string => typeof id === "string") : [],
    notes: typeof candidate.notes === "string" ? candidate.notes : "",
    templateKind: TASK_TEMPLATES.has(candidate.templateKind as TaskTemplateKind) ? candidate.templateKind : "general",
    checklist,
    records,
  };
}

function normalizeBags(state: AppState): AppState["bags"] {
  const legacyDefaults = (state.dataRevision ?? 0) < 4
    && state.bags.length === 3
    && state.bags.some((bag) => bag.id === "checked" && bag.limitKg === 23)
    && state.bags.some((bag) => bag.id === "carry" && bag.limitKg === 8)
    && state.bags.some((bag) => bag.id === "personal" && bag.limitKg === 3);
  return state.bags.map((bag) => ({
    ...bag,
    limitKg: legacyDefaults ? 0 : bag.limitKg,
    limitSource: legacyDefaults ? "unconfirmed" : bag.limitSource ?? (bag.limitKg > 0 ? "manual" : "unconfirmed"),
  }));
}

export function normalizeImportedState(state: AppState): AppState {
  const fallback = cloneDefault();
  const tasks = Array.isArray(state.tasks) ? state.tasks.map(normalizeTask) : fallback.tasks;
  const bags = Array.isArray(state.bags) ? state.bags : fallback.bags;
  const normalizedBags = normalizeBags({ ...state, bags });
  const travelPlans = Array.isArray(state.travelPlans) ? state.travelPlans : [];
  const resources = Array.isArray(state.resources) ? state.resources : [];
  const budget = Array.isArray(state.budget) ? state.budget : fallback.budget;
  return {
    ...state,
    dataRevision: CURRENT_DATA_REVISION,
    setupCompleted: typeof state.setupCompleted === "boolean"
      ? state.setupCompleted
      : !["Your host university", "交換學校"].includes(state.journey?.hostSchool ?? ""),
    journey: {
      ...fallback.journey,
      ...(state.journey ?? {}),
      destinations: Array.isArray(state.journey?.destinations) ? state.journey.destinations.filter((item): item is string => typeof item === "string") : fallback.journey.destinations,
    },
    tasks,
    bags: normalizedBags,
    travelPlans: travelPlans.map((plan) => ({
      ...plan,
      travelNotes: plan.travelNotes ?? [],
      packingItems: plan.packingItems ?? [],
      days: plan.days.map((day) => ({
        ...day,
        activities: day.activities.map((activity) => ({
          ...activity,
          mapsUrl: activity.mapsUrl ?? "",
        })),
      })),
    })),
    studyEvents: Array.isArray(state.studyEvents) ? state.studyEvents : [],
    flightAllowances: (state.flightAllowances ?? []).map((allowance) => {
      const legacy = allowance as FlightAllowance & { carryOnKg?: number; personalItemKg?: number };
      return {
        id: allowance.id,
        label: allowance.label,
        airline: allowance.airline,
        segment: allowance.segment,
        checkedMode: allowance.checkedMode,
        checkedPieceCount: allowance.checkedPieceCount,
        checkedPieceWeightKg: allowance.checkedPieceWeightKg,
        checkedTotalWeightKg: allowance.checkedTotalWeightKg,
        carryOnMode: allowance.carryOnMode ?? (legacy.carryOnKg && legacy.carryOnKg > 0 ? "piece" : "unknown"),
        carryOnPieceCount: allowance.carryOnPieceCount ?? (legacy.carryOnKg && legacy.carryOnKg > 0 ? 1 : 0),
        carryOnPieceWeightKg: allowance.carryOnPieceWeightKg ?? legacy.carryOnKg ?? 0,
        personalItemMode: allowance.personalItemMode ?? (legacy.personalItemKg && legacy.personalItemKg > 0 ? "piece" : "unknown"),
        personalItemPieceCount: allowance.personalItemPieceCount ?? (legacy.personalItemKg && legacy.personalItemKg > 0 ? 1 : 0),
        personalItemPieceWeightKg: allowance.personalItemPieceWeightKg ?? legacy.personalItemKg ?? 0,
        provenance: allowance.provenance ?? "manual",
        confirmed: allowance.confirmed ?? false,
        sourceLabel: allowance.sourceLabel,
        verifiedAt: allowance.verifiedAt,
        notes: allowance.notes,
      };
    }),
    resources: resources.map((resource) => ({
      ...resource,
      details: resource.details ?? "",
      origin: resource.origin ?? "manual",
      privacy: resource.privacy ?? "private",
      sourceLabel: resource.sourceLabel ?? "舊版手動資料",
    })),
    resourceIntake: Array.isArray(state.resourceIntake) ? state.resourceIntake : [],
    budget: budget.map((item, index) => {
      const legacy = item as Partial<BudgetItem>;
      const fallbackItem = fallback.budget.find((candidate) => candidate.id === legacy.id) ?? fallback.budget[index];
      const amount = typeof legacy.amount === "number" && Number.isFinite(legacy.amount) && legacy.amount >= 0 ? legacy.amount : 0;
      return {
        id: typeof legacy.id === "string" && legacy.id ? legacy.id : `budget-${index + 1}`,
        name: typeof legacy.name === "string" && legacy.name ? legacy.name : fallbackItem?.name ?? "其他預算",
        category: BUDGET_CATEGORIES.has(legacy.category as BudgetItem["category"]) ? legacy.category as BudgetItem["category"] : fallbackItem?.category ?? "other",
        amount,
        currency: typeof legacy.currency === "string" && /^[A-Z]{3}$/.test(legacy.currency) ? legacy.currency : exchangeProfile.primaryCurrency,
        cadence: legacy.cadence === "once" || legacy.cadence === "monthly" ? legacy.cadence : fallbackItem?.cadence ?? "once",
        basis: BUDGET_BASES.has(legacy.basis as BudgetItem["basis"]) ? legacy.basis as BudgetItem["basis"] : amount > 0 ? "estimate" : "unset",
        paid: Boolean(legacy.paid),
        notes: typeof legacy.notes === "string" ? legacy.notes : "",
        sourceLabel: typeof legacy.sourceLabel === "string" ? legacy.sourceLabel : amount > 0 ? "舊版手動紀錄" : "",
        verifiedAt: typeof legacy.verifiedAt === "string" ? legacy.verifiedAt : "",
      };
    }),
    aiInbox: state.aiInbox ?? { sources: [], proposals: [] },
  };
}

export function loadState(useLocalStorage = true): AppState {
  if (typeof window === "undefined" || !useLocalStorage) return cloneDefault();
  try {
    const key = journeyStorageKey();
    let raw = window.localStorage.getItem(key);
    if (!raw) {
      const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        const parsedLegacy = JSON.parse(legacy) as Partial<AppState>;
        if (matchesConfiguredJourney(parsedLegacy)) {
          raw = legacy;
          window.localStorage.setItem(key, legacy);
        }
      }
    }
    if (!raw) return cloneDefault();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    if (parsed.version !== 1 || !parsed.journey || !Array.isArray(parsed.tasks)) {
      return cloneDefault();
    }
    const parsedState = parsed as AppState;
    return normalizeImportedState({
      ...parsedState,
      tasks: parsedState.tasks,
      travelPlans: parsedState.travelPlans ?? defaultState.travelPlans ?? [],
      studyEvents: parsedState.studyEvents ?? defaultState.studyEvents ?? [],
      flightAllowances: parsedState.flightAllowances ?? defaultState.flightAllowances ?? [],
      resourceIntake: parsedState.resourceIntake ?? defaultState.resourceIntake ?? [],
    });
  } catch {
    return cloneDefault();
  }
}

export function saveState(state: AppState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(journeyStorageKey(), JSON.stringify(state));
}

export function resetState(): AppState {
  const fresh = cloneDefault();
  saveState(fresh);
  return fresh;
}

export function validateImport(value: unknown): value is AppState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AppState>;
  return (
    candidate.version === 1 &&
    Boolean(candidate.journey) &&
    Array.isArray(candidate.tasks) &&
    Array.isArray(candidate.bags) &&
    Array.isArray(candidate.packingItems) &&
    Array.isArray(candidate.resources)
  );
}
