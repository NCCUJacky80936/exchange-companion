import type {
  AiImportBundle,
  AiProposal,
  AppState,
  JourneyTask,
  PackingItem,
  ResourceItem,
  StudyEvent,
  TravelPlan,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function validateAiImportBundle(value: unknown): value is AiImportBundle {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.generatedAt !== "string") return false;
  if (!Array.isArray(value.sources) || !Array.isArray(value.proposals)) return false;
  return value.sources.every((source) => isRecord(source)
      && typeof source.id === "string"
      && typeof source.label === "string"
      && typeof source.kind === "string"
      && typeof source.capturedAt === "string")
    && value.proposals.every((proposal) => isRecord(proposal)
      && typeof proposal.id === "string"
      && typeof proposal.title === "string"
      && typeof proposal.entity === "string"
      && isRecord(proposal.value)
      && Array.isArray(proposal.evidenceIds));
}

export function importAiBundle(state: AppState, bundle: AiImportBundle): AppState {
  const existingSources = new Map((state.aiInbox?.sources ?? []).map((source) => [source.id, source]));
  bundle.sources.forEach((source) => existingSources.set(source.id, source));
  const existingProposals = new Map((state.aiInbox?.proposals ?? []).map((proposal) => [proposal.id, proposal]));
  bundle.proposals.forEach((proposal) => existingProposals.set(proposal.id, { ...proposal, status: proposal.status ?? "pending" }));
  return {
    ...state,
    aiInbox: {
      lastImportedAt: new Date().toISOString(),
      sources: [...existingSources.values()],
      proposals: [...existingProposals.values()],
    },
  };
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

export function applyAiProposal(state: AppState, proposalId: string): AppState {
  const proposal = state.aiInbox?.proposals.find((item) => item.id === proposalId);
  if (!proposal || proposal.status !== "pending") return state;
  let next = state;
  const currentEntity = proposal.action === "update" && proposal.targetId
    ? [
      ...state.tasks,
      ...state.resources,
      ...state.packingItems,
      ...(state.studyEvents ?? []),
      ...(state.travelPlans ?? []),
    ].find((item) => item.id === proposal.targetId)
    : undefined;
  if (proposal.entity === "task") next = { ...next, tasks: addOrUpdate<JourneyTask>(next.tasks, proposal) };
  if (proposal.entity === "resource") next = { ...next, resources: addOrUpdate<ResourceItem>(next.resources, proposal) };
  if (proposal.entity === "packing-item") next = { ...next, packingItems: addOrUpdate<PackingItem>(next.packingItems, proposal) };
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

function restoreById<T extends { id: string }>(items: T[], previous: Record<string, unknown>): T[] {
  return items.map((item) => item.id === previous.id ? previous as unknown as T : item);
}

export function undoAiProposal(state: AppState, proposalId: string): AppState {
  const proposal = state.aiInbox?.proposals.find((item) => item.id === proposalId);
  if (!proposal || proposal.status !== "applied") return state;
  const entityId = proposal.action === "add" ? String(proposal.value.id ?? "") : proposal.targetId ?? "";
  if (!entityId) return state;
  const revert = <T extends { id: string }>(items: T[]) => proposal.action === "add"
    ? removeById(items, entityId)
    : proposal.previousValue ? restoreById(items, proposal.previousValue) : items;
  let next = state;
  if (proposal.entity === "task") next = { ...next, tasks: revert(next.tasks) };
  if (proposal.entity === "resource") next = { ...next, resources: revert(next.resources) };
  if (proposal.entity === "packing-item") next = { ...next, packingItems: revert(next.packingItems) };
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
