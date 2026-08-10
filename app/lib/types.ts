export type TaskStatus =
  | "not-started"
  | "in-progress"
  | "waiting"
  | "done"
  | "not-applicable";

export type Priority = "high" | "medium" | "low";

export type JourneyPhase =
  | "admission"
  | "visa"
  | "pre-departure"
  | "arrival-72h"
  | "arrival-2w"
  | "semester"
  | "return";

export type PackingDecision = "must" | "recommend" | "buy-there" | "skip";

export type TaskTemplateKind =
  | "general"
  | "flight"
  | "course"
  | "visa"
  | "housing"
  | "payment"
  | "school-admin";

export interface TaskChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface TaskRecordEntry {
  id: string;
  date: string;
  note: string;
}

export interface JourneyTask {
  id: string;
  title: string;
  description: string;
  phase: JourneyPhase;
  status: TaskStatus;
  priority: Priority;
  dueDate?: string;
  predecessorIds: string[];
  notes: string;
  sourceLabel?: string;
  sourceUrl?: string;
  verifiedAt?: string;
  templateKind?: TaskTemplateKind;
  scheduledAt?: string;
  timeZone?: "Asia/Taipei" | "Europe/Berlin";
  location?: string;
  contactName?: string;
  contactInfo?: string;
  referenceNumber?: string;
  cost?: number;
  currency?: "EUR" | "TWD";
  checklist?: TaskChecklistItem[];
  records?: TaskRecordEntry[];
  result?: string;
}

export interface Bag {
  id: string;
  name: string;
  kind: "checked" | "carry-on" | "personal";
  limitKg: number;
}

export interface PackingItem {
  id: string;
  name: string;
  category: string;
  decision: PackingDecision;
  bagId: string;
  quantity: number;
  weightKg: number;
  packed: boolean;
  warning?: string;
}

export interface ResourceItem {
  id: string;
  title: string;
  description: string;
  category: string;
  type: "official" | "school" | "city" | "experience";
  url: string;
  verifiedAt: string;
  region: string;
}

export interface BudgetItem {
  id: string;
  name: string;
  amount: number;
  cadence: "once" | "monthly";
  paid: boolean;
}

export type TravelActivityKind = "place" | "food" | "transport" | "stay" | "note";

export interface TravelActivity {
  id: string;
  time: string;
  title: string;
  kind: TravelActivityKind;
  location: string;
  mapsUrl?: string;
  durationMinutes: number;
  cost: number;
  booked: boolean;
  notes: string;
}

export interface TravelDay {
  id: string;
  date: string;
  title: string;
  activities: TravelActivity[];
}

export type TravelNoteCategory = "transport" | "booking" | "safety" | "food" | "shopping" | "general";

export interface TravelNote {
  id: string;
  title: string;
  details: string;
  category: TravelNoteCategory;
  important: boolean;
}

export interface TravelPackingItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  packed: boolean;
  notes: string;
}

export interface TravelPlan {
  id: string;
  kind: "travel";
  title: string;
  destinations: string[];
  startDate: string;
  endDate: string;
  travelers: string;
  budget: number;
  currency: "EUR" | "TWD";
  notes: string;
  days: TravelDay[];
  travelNotes: TravelNote[];
  packingItems: TravelPackingItem[];
  createdAt: string;
  updatedAt: string;
  cloud?: TravelCloudMeta;
}

export type TravelPermission = "viewer" | "editor" | "owner";
export type TravelShareAccess = "anyone" | "approved_google";

export interface TravelCloudMeta {
  published: boolean;
  ownerId?: string;
  permission?: TravelPermission;
  lastSyncedAt?: string;
}

export interface TravelShareLink {
  id: string;
  url: string;
  permission: Exclude<TravelPermission, "owner">;
  accessMode: TravelShareAccess;
  expiresAt?: string;
}

export type EvidenceKind = "official" | "school" | "city" | "email" | "file" | "video" | "research";
export type AiProposalEntity = "task" | "resource" | "packing-item" | "study-event" | "travel-plan";
export type AiProposalStatus = "pending" | "applied" | "dismissed";

export interface EvidenceSource {
  id: string;
  label: string;
  kind: EvidenceKind;
  url?: string;
  capturedAt: string;
  note?: string;
}

export interface AiProposal {
  id: string;
  title: string;
  summary: string;
  entity: AiProposalEntity;
  action: "add" | "update";
  targetId?: string;
  value: Record<string, unknown>;
  confidence: "high" | "medium" | "low";
  privacy: "private" | "shareable";
  evidenceIds: string[];
  status: AiProposalStatus;
  previousValue?: Record<string, unknown>;
  appliedAt?: string;
}

export interface AiImportBundle {
  schemaVersion: 1;
  generatedAt: string;
  journeyScope: string;
  sources: EvidenceSource[];
  proposals: AiProposal[];
}

export interface AiInbox {
  lastImportedAt?: string;
  sources: EvidenceSource[];
  proposals: AiProposal[];
}

export type StudyEventKind = "class" | "exam" | "deadline" | "orientation" | "personal";

export interface StudyEvent {
  id: string;
  title: string;
  kind: StudyEventKind;
  startDate: string;
  endDate?: string;
  startTime?: string;
  repeatWeekly?: boolean;
  mandatory: boolean;
  notes: string;
}

export interface Journey {
  id: string;
  kind: "exchange" | "travel";
  title: string;
  ownerName: string;
  homeCity: string;
  hostCity: string;
  hostSchool: string;
  program: string;
  startDate: string;
  endDate: string;
  orientationDate: string;
  destinations: string[];
}

export interface AppState {
  version: 1;
  dataRevision?: number;
  journey: Journey;
  tasks: JourneyTask[];
  bags: Bag[];
  packingItems: PackingItem[];
  resources: ResourceItem[];
  budget: BudgetItem[];
  emergencyContact: string;
  travelPlans?: TravelPlan[];
  studyEvents?: StudyEvent[];
  aiInbox?: AiInbox;
}

export type NavSection = "home" | "journey" | "travel" | "packing" | "resources" | "ai" | "settings";
