import type { AppState, ResourceIntake } from "./types";

export const PROCESSED_RESOURCE_INTAKE_RETENTION_MS = 2 * 86_400_000;

export function stampProcessedResourceIntake(item: ResourceIntake, now = new Date().toISOString()): ResourceIntake {
  if (item.status !== "processed" || item.processedAt) return item;
  return { ...item, processedAt: now };
}

export function pruneProcessedResourceIntake(state: AppState, now = Date.now()): AppState {
  const items = state.resourceIntake ?? [];
  const retained = items.filter((item) => {
    if (item.status !== "processed" || !item.processedAt) return true;
    const processed = Date.parse(item.processedAt);
    return !Number.isFinite(processed) || now - processed < PROCESSED_RESOURCE_INTAKE_RETENTION_MS;
  });
  return retained.length === items.length ? state : { ...state, resourceIntake: retained };
}
