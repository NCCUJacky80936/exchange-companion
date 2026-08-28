import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_TRAVEL_TRANSFER_BYTES,
  createTravelTransferBundle,
  findTravelImportTarget,
  parseTravelTransferText,
  previewTravelMerge,
} from "../app/lib/travel-transfer";
import type { TravelPlan } from "../app/lib/types";

function activity(id: string, title: string, mapsUrl = "") {
  return {
    id,
    time: "09:00",
    title,
    kind: "place" as const,
    location: "Bangkok",
    mapsUrl,
    durationMinutes: 60,
    cost: 0,
    booked: false,
    notes: "Rain backup available.",
    imageUrl: "https://images.example/photo.jpg",
    imageAlt: `${title} photo`,
    imageSourceLabel: "Example source",
    imageSourceUrl: "https://images.example/source",
  };
}

function plan(overrides: Partial<TravelPlan> = {}): TravelPlan {
  return {
    id: "travel-thailand",
    kind: "travel",
    title: "Thailand",
    destinations: ["Bangkok / Thailand"],
    startDate: "2026-09-26",
    endDate: "2026-09-30",
    travelers: "Local traveler",
    budget: 20_000,
    currency: "TWD",
    notes: "Local note",
    days: [{ id: "day-2026-09-26", date: "2026-09-26", title: "Day 1", activities: [] }],
    stays: [],
    references: [],
    travelNotes: [],
    packingItems: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

test("exports a versioned travel-only bundle without cloud metadata", () => {
  const bundle = createTravelTransferBundle(plan({ cloud: { published: true, ownerId: "owner", cloudPlanId: "cloud", permission: "owner" } }), "2026-08-28T12:00:00.000Z");
  assert.equal(bundle.kind, "exchange-companion-travel-transfer");
  assert.equal(bundle.exportedAt, "2026-08-28T12:00:00.000Z");
  assert.equal(bundle.trip.cloud, undefined);
});

test("accepts the new envelope and legacy bare travel JSON", () => {
  const trip = plan({ days: [{ id: "day-2026-09-26", date: "2026-09-26", title: "Day 1", activities: [activity("activity-1", "Temple")] }] });
  const current = parseTravelTransferText(JSON.stringify(createTravelTransferBundle(trip)));
  const legacy = parseTravelTransferText(JSON.stringify({ ...trip, cloud: { published: true, ownerId: "owner", permission: "owner" } }));
  assert.equal(current.valid, true);
  assert.equal(current.valid && current.legacy, false);
  assert.equal(legacy.valid, true);
  assert.equal(legacy.valid && legacy.legacy, true);
  assert.equal(legacy.valid && legacy.trip.cloud, undefined);
});

test("rejects unsafe URLs, invalid date ranges, and oversized files", () => {
  const unsafe = plan({ references: [{ id: "reference-1", label: "Private", kind: "guide", url: "https://example.com/?access_token=secret", description: "" }] });
  const reversed = plan({ startDate: "2026-09-30", endDate: "2026-09-26" });
  assert.equal(parseTravelTransferText(JSON.stringify(unsafe)).valid, false);
  assert.equal(parseTravelTransferText(JSON.stringify(reversed)).valid, false);
  assert.equal(parseTravelTransferText(`{"padding":"${"x".repeat(MAX_TRAVEL_TRANSFER_BYTES)}"}`).valid, false);
});

test("matches by ID first and then by dates plus destination", () => {
  const existing = plan();
  assert.equal(findTravelImportTarget(plan(), [existing]).match, "id");
  assert.equal(findTravelImportTarget(plan({ id: "external-id", destinations: ["Thailand, Bangkok"] }), [existing]).match, "dates-and-destination");
  assert.equal(findTravelImportTarget(plan({ id: "external-id", startDate: "2027-01-01", endDate: "2027-01-02" }), [existing]).match, "new");
});

test("merge preserves local basics, adds activities, and is idempotent", () => {
  const local = plan();
  const incoming = plan({
    title: "External title",
    travelers: "External traveler",
    budget: 99_999,
    notes: "External note",
    days: [{ id: "external-day", date: "2026-09-26", title: "Imported day", activities: [activity("external-activity", "Temple", "https://maps.example/temple")] }],
    stays: [{ id: "stay-1", name: "Hotel", checkIn: "2026-09-26", checkOut: "2026-09-29", area: "Sukhumvit", address: "", mapsUrl: "https://maps.example/hotel", sourceUrl: "https://hotel.example", imageUrl: "https://hotel.example/photo.jpg", imageAlt: "Hotel", summary: "Transit base", highlights: [], notes: "" }],
  });
  const first = previewTravelMerge(incoming, [local], "2026-08-28T12:00:00.000Z");
  assert.equal(first.plan.title, local.title);
  assert.equal(first.plan.travelers, local.travelers);
  assert.equal(first.plan.budget, local.budget);
  assert.equal(first.plan.days[0].activities.length, 1);
  assert.equal(first.plan.days[0].activities[0].imageSourceLabel, "Example source");
  assert.equal(first.summary.activities.added, 1);
  const retry = previewTravelMerge(incoming, [first.plan], "2026-08-28T13:00:00.000Z");
  assert.equal(retry.plan.days[0].activities.length, 1);
  assert.equal(retry.summary.activities.added, 0);
  assert.equal(retry.summary.activities.ignored, 1);
});
