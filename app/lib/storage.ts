import { defaultState } from "./default-data";
import type { AppState, FlightAllowance } from "./types";

const LEGACY_STORAGE_KEY = "exchange-companion:v1";
const CURRENT_DATA_REVISION = 4;

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
  const normalizedBags = normalizeBags(state);
  return {
    ...state,
    dataRevision: CURRENT_DATA_REVISION,
    bags: normalizedBags,
    travelPlans: (state.travelPlans ?? []).map((plan) => ({
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
    studyEvents: state.studyEvents ?? [],
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
    resources: state.resources.map((resource) => ({
      ...resource,
      origin: resource.origin ?? "manual",
      privacy: resource.privacy ?? "private",
      sourceLabel: resource.sourceLabel ?? "舊版手動資料",
    })),
    resourceIntake: state.resourceIntake ?? [],
    aiInbox: state.aiInbox ?? { sources: [], proposals: [] },
  };
}

export function loadState(): AppState {
  if (typeof window === "undefined") return cloneDefault();
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
