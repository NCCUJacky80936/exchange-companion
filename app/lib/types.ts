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
  timeZone?: string;
  location?: string;
  contactName?: string;
  contactInfo?: string;
  referenceNumber?: string;
  cost?: number;
  currency?: string;
  checklist?: TaskChecklistItem[];
  records?: TaskRecordEntry[];
  result?: string;
}

export interface Bag {
  id: string;
  name: string;
  kind: "checked" | "carry-on" | "personal";
  limitKg: number;
  limitSource: "unconfirmed" | "ticket" | "manual";
}

export interface FlightAllowance {
  id: string;
  label: string;
  airline: string;
  segment: string;
  checkedMode: "piece" | "weight" | "none" | "unknown";
  checkedPieceCount: number;
  checkedPieceWeightKg: number;
  checkedTotalWeightKg: number;
  carryOnMode: "piece" | "none" | "unknown";
  carryOnPieceCount: number;
  carryOnPieceWeightKg: number;
  personalItemMode: "piece" | "none" | "unknown";
  personalItemPieceCount: number;
  personalItemPieceWeightKg: number;
  provenance: "ticket" | "manual";
  confirmed: boolean;
  sourceLabel: string;
  verifiedAt: string;
  notes: string;
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
  notes?: string;
}

export interface ResourceItem {
  id: string;
  title: string;
  description: string;
  details: string;
  category: string;
  type: "official" | "school" | "city" | "experience" | "personal";
  url: string;
  verifiedAt: string;
  region: string;
  origin: "user-upload" | "ai-research" | "manual";
  privacy: "private" | "shareable";
  sourceLabel: string;
  searchTags?: string[];
}

export interface ResourceIntake {
  id: string;
  url: string;
  note: string;
  status: "pending" | "processed";
  createdAt: string;
  /** Website-owned timestamp used to remove completed URL intake records after 48 hours. */
  processedAt?: string;
}

export interface BudgetItem {
  id: string;
  name: string;
  category: "housing" | "food" | "transport" | "arrival" | "other";
  amount: number;
  currency: string;
  cadence: "once" | "monthly";
  basis: "unset" | "estimate" | "confirmed";
  paid: boolean;
  notes: string;
  sourceLabel: string;
  verifiedAt: string;
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
  date?: string;
  priority?: "low" | "medium" | "high";
}

export interface TravelPackingItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  packed: boolean;
  notes: string;
}

export interface TravelStay {
  id: string;
  name: string;
  checkIn: string;
  checkOut: string;
  area: string;
  address: string;
  mapsUrl: string;
  sourceUrl: string;
  imageUrl: string;
  imageAlt: string;
  summary: string;
  highlights: string[];
  notes: string;
}

export type TravelReferenceKind = "map-list" | "spreadsheet" | "guide" | "booking" | "other";

export interface TravelReference {
  id: string;
  label: string;
  kind: TravelReferenceKind;
  url: string;
  description: string;
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
  currency: string;
  notes: string;
  days: TravelDay[];
  stays?: TravelStay[];
  references?: TravelReference[];
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
  /** Stable cloud row ID. The local TravelPlan.id remains unchanged. */
  cloudPlanId?: string;
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

export interface TravelLinkSettings {
  id: string;
  url: string;
  permission: Exclude<TravelPermission, "owner">;
  enabled: boolean;
  expiresAt?: string;
}

export interface TravelMemberAccess {
  id: string;
  account: string;
  permission: Exclude<TravelPermission, "owner">;
}

export interface TravelSharingSettings {
  link: TravelLinkSettings;
  members: TravelMemberAccess[];
}

export type EvidenceKind = "official" | "school" | "city" | "email" | "file" | "video" | "research";
export type AiProposalEntity = "journey" | "task" | "resource" | "resource-intake" | "packing-item" | "bag" | "flight-allowance" | "budget-item" | "study-event" | "travel-plan";
export type AiProposalStatus = "pending" | "applied" | "dismissed";

export interface EvidenceSource {
  id: string;
  label: string;
  kind: EvidenceKind;
  evidenceType?: "general" | "ticket";
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
  /** Website-only optimistic concurrency metadata; Agents do not author this field. */
  baseRevision?: number;
  /** Website-only snapshot of the fields this proposal may change. */
  baselineValue?: Record<string, unknown>;
  /** Fields that did not exist when the proposal entered the review inbox. */
  baselineAbsentFields?: string[];
  cloudRunId?: string;
  previousValue?: Record<string, unknown>;
  appliedAt?: string;
  /** Website-only retention timestamp; Agents do not author this field. */
  createdAt?: string;
  /** Website-only marker showing that a person changed the proposed copy or fields before accepting. */
  userEditedAt?: string;
}

export interface AiImportBundle {
  schemaVersion: 1;
  generatedAt: string;
  journeyScope: string;
  baseRevision?: number;
  sources: EvidenceSource[];
  proposals: AiProposal[];
}

export interface ConciergeConnectionInfo {
  id: string;
  label: string;
  journeyId: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt?: string;
  expiresAt: string;
  revokedAt?: string;
}

export interface ConciergeConnectionFile {
  schemaVersion: 1;
  kind: "exchange-concierge-connection";
  endpoint: string;
  token: string;
  journeyId: string;
  journeyScope: string;
  createdAt: string;
  expiresAt: string;
  permissions: string[];
  requiredSkill: "$exchange-concierge";
  warning: string;
}

export interface AiInbox {
  lastImportedAt?: string;
  journeyScope?: string;
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
  endTime?: string;
  location?: string;
  classroom?: string;
  teacher?: string;
  semester?: string;
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

export interface NotebookPersonalization {
  sidebarNote: string;
  avatarDataUrl: string;
  headingLanguage: "zh-TW" | "en";
}

export interface HomeExperience {
  mode: "activation" | "dashboard";
  workflow: "undecided" | "ai" | "manual";
  tutorialVersion: number;
  starterPromptCopiedAt?: string;
  activatedAt?: string;
}

export interface AppState {
  version: 1;
  dataRevision?: number;
  setupCompleted?: boolean;
  journey: Journey;
  tasks: JourneyTask[];
  bags: Bag[];
  flightAllowances?: FlightAllowance[];
  packingItems: PackingItem[];
  resources: ResourceItem[];
  resourceIntake?: ResourceIntake[];
  budget: BudgetItem[];
  emergencyContact: string;
  travelPlans?: TravelPlan[];
  studyEvents?: StudyEvent[];
  aiInbox?: AiInbox;
  personalization?: NotebookPersonalization;
  homeExperience?: HomeExperience;
}

export type NavSection = "home" | "journey" | "travel" | "resources" | "ai" | "settings";
export type JourneyView = "progress" | "packing";
