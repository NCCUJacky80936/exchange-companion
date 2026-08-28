import assert from "node:assert/strict";
import test from "node:test";
import { cloudPlanIdFor, matchesPublicTravelPayload, publicTravelPayload, resolveTravelPermission } from "../app/lib/travel-cloud";
import type { TravelPlan, TravelReference, TravelStay } from "../app/lib/types";

function plan(overrides: Partial<TravelPlan> = {}): TravelPlan {
  return {
    id: "travel-local-1",
    kind: "travel",
    title: "QA Trip",
    destinations: ["Test City"],
    startDate: "2026-09-01",
    endDate: "2026-09-02",
    travelers: "",
    budget: 100,
    currency: "TWD",
    notes: "",
    days: [{ id: "day-1", date: "2026-09-01", title: "Day 1", activities: [] }],
    stays: [],
    references: [],
    travelNotes: [],
    packingItems: [],
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
    ...overrides,
  };
}

test("cloud IDs are stable per user and separate from local trip IDs", async () => {
  const first = await cloudPlanIdFor(plan(), "82773ffe-e56b-44fd-bdb4-439180828413");
  const retry = await cloudPlanIdFor(plan(), "82773ffe-e56b-44fd-bdb4-439180828413");
  const anotherUser = await cloudPlanIdFor(plan(), "fde89ac0-ccfa-4070-a430-f4401454abf4");
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(first, retry);
  assert.notEqual(first, anotherUser);
  assert.notEqual(first, plan().id);
});

test("database ownership always outranks a share-link permission", () => {
  assert.equal(resolveTravelPermission("user-1", "user-1", "viewer"), "owner");
  assert.equal(resolveTravelPermission("user-1", "user-1", "editor"), "owner");
  assert.equal(resolveTravelPermission("user-1", "user-2", "editor"), "editor");
});

test("shared payload uses an explicit travel-only whitelist", () => {
  const source = {
    ...plan({
      stays: [{ id: "stay-1", name: "Hotel", checkIn: "2026-09-01", checkOut: "2026-09-02", area: "Center", address: "Public address", mapsUrl: "https://maps.example/stay", sourceUrl: "https://hotel.example", imageUrl: "https://hotel.example/photo.jpg", imageAlt: "Hotel", summary: "Close to transit", highlights: ["Direct train"], notes: "", privateBookingCode: "stay-secret" } as TravelStay & { privateBookingCode: string }],
      references: [{ id: "ref-1", label: "Map", kind: "map-list", url: "https://maps.example/list", description: "Shared list", rawAccountData: "private" } as TravelReference & { rawAccountData: string }],
      days: [{
        id: "day-1",
        date: "2026-09-01",
        title: "Day 1",
        activities: [{ id: "activity-1", time: "09:00", title: "Museum", kind: "place", location: "City", mapsUrl: "", durationMinutes: 60, cost: 10, booked: false, notes: "", imageUrl: "https://images.example/museum.jpg", imageAlt: "Museum", imageSourceLabel: "Photo source", imageSourceUrl: "https://images.example/source", privateBookingCode: "secret" } as TravelPlan["days"][number]["activities"][number] & { privateBookingCode: string }],
      }],
    }),
    cloud: { published: true, cloudPlanId: "cloud-id", ownerId: "owner", permission: "owner" as const },
    privateExchangeState: { visa: "secret" },
  } as TravelPlan & { privateExchangeState: unknown };
  const payload = publicTravelPayload(source);
  assert.equal(payload.cloud, undefined);
  assert.equal("privateExchangeState" in payload, false);
  assert.deepEqual(Object.keys(payload).sort(), ["budget", "createdAt", "currency", "days", "destinations", "endDate", "id", "kind", "notes", "packingItems", "references", "startDate", "stays", "title", "travelNotes", "travelers", "updatedAt"].sort());
  assert.equal("privateBookingCode" in payload.days[0].activities[0], false);
  assert.equal(payload.days[0].activities[0].imageSourceLabel, "Photo source");
  assert.equal("privateBookingCode" in (payload.stays?.[0] ?? {}), false);
  assert.equal("rawAccountData" in (payload.references?.[0] ?? {}), false);
});

test("an existing cloud mapping is always reused", async () => {
  const mapped = plan({ cloud: { published: true, cloudPlanId: "5abfae62-55a4-5cc0-9f84-5b076b431a9f", permission: "owner" } });
  assert.equal(await cloudPlanIdFor(mapped, "another-user"), mapped.cloud?.cloudPlanId);
});

test("shared payload comparison ignores database key ordering", () => {
  const source = plan();
  const payload = publicTravelPayload(source);
  const reordered = Object.fromEntries(Object.entries(payload).reverse());
  assert.equal(matchesPublicTravelPayload(reordered, source), true);
  assert.equal(matchesPublicTravelPayload({ ...reordered, title: "Changed" }, source), false);
});
