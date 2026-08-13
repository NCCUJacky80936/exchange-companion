import assert from "node:assert/strict";
import test from "node:test";
import { sortTravelPlansForDisplay, travelTemporalStatus } from "../app/lib/travel-sort";
import type { TravelPlan } from "../app/lib/types";

function plan(id: string, startDate: string, endDate: string): TravelPlan {
  return { id, kind: "travel", title: id, destinations: [], startDate, endDate, travelers: "", budget: 0, currency: "TWD", notes: "", days: [], stays: [], references: [], travelNotes: [], packingItems: [], createdAt: "", updatedAt: "" };
}

test("sorts ongoing and nearest future trips first while moving past trips below", () => {
  const today = "2026-08-12";
  const sorted = sortTravelPlansForDisplay([
    plan("old", "2025-01-01", "2025-01-05"),
    plan("later", "2026-12-01", "2026-12-05"),
    plan("recent-past", "2026-07-01", "2026-07-05"),
    plan("next", "2026-09-01", "2026-09-05"),
    plan("now", "2026-08-10", "2026-08-15"),
  ], today);
  assert.deepEqual(sorted.map((item) => item.id), ["now", "next", "later", "recent-past", "old"]);
  assert.equal(travelTemporalStatus(sorted[0], today), "ongoing");
  assert.equal(travelTemporalStatus(sorted.at(-1)!, today), "past");
});
