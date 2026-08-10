import { defaultState } from "./default-data";
import type { AppState } from "./types";

const STORAGE_KEY = "exchange-companion:v1";
const CURRENT_DATA_REVISION = 3;

function cloneDefault(): AppState {
  return JSON.parse(JSON.stringify(defaultState)) as AppState;
}

export function normalizeImportedState(state: AppState): AppState {
  return {
    ...state,
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
    aiInbox: state.aiInbox ?? { sources: [], proposals: [] },
  };
}

export function loadState(): AppState {
  if (typeof window === "undefined") return cloneDefault();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefault();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    if (parsed.version !== 1 || !parsed.journey || !Array.isArray(parsed.tasks)) {
      return cloneDefault();
    }
    const parsedState = parsed as AppState;
    return normalizeImportedState({
      ...parsedState,
      dataRevision: CURRENT_DATA_REVISION,
      tasks: parsedState.tasks,
      travelPlans: parsedState.travelPlans ?? defaultState.travelPlans ?? [],
      studyEvents: parsedState.studyEvents ?? defaultState.studyEvents ?? [],
    });
  } catch {
    return cloneDefault();
  }
}

export function saveState(state: AppState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
