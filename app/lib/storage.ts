import { defaultState } from "./default-data";
import type { AppState } from "./types";

const STORAGE_KEY = "exchange-companion:v1";
const CURRENT_DATA_REVISION = 2;
const REFRESHED_PROGRESS_TASKS = new Set([
  "learning-agreement",
  "visa-appointment",
  "flight",
  "buddy",
]);

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
    const needsProgressRefresh = (parsedState.dataRevision ?? 1) < CURRENT_DATA_REVISION;
    const mergedTasks = parsedState.tasks.map((task) => {
      const seededTask = defaultState.tasks.find((item) => item.id === task.id);
      if (!seededTask) return task;

      if (needsProgressRefresh && REFRESHED_PROGRESS_TASKS.has(task.id)) {
        const existingChecklist = new Map((task.checklist ?? []).map((item) => [item.id, item]));
        const existingRecords = new Map((task.records ?? []).map((item) => [item.id, item]));
        return {
          ...task,
          ...seededTask,
          status: task.status === "done" ? "done" : seededTask.status,
          checklist: (seededTask.checklist ?? []).map((item) => ({
            ...item,
            done: existingChecklist.get(item.id)?.done ?? item.done,
          })),
          records: [
            ...(seededTask.records ?? []),
            ...(task.records ?? []).filter((item) => !existingRecords.has(item.id) || !(seededTask.records ?? []).some((seeded) => seeded.id === item.id)),
          ],
        };
      }

      return {
        ...seededTask,
        ...task,
        checklist: task.checklist ?? seededTask.checklist ?? [],
        records: task.records ?? seededTask.records ?? [],
      };
    });

    const existingTaskIds = new Set(mergedTasks.map((task) => task.id));
    return normalizeImportedState({
      ...parsedState,
      dataRevision: CURRENT_DATA_REVISION,
      tasks: [
        ...mergedTasks,
        ...defaultState.tasks.filter((task) => !existingTaskIds.has(task.id)),
      ],
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
