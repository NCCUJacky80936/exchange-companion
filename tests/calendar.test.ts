import assert from "node:assert/strict";
import test from "node:test";
import { googleCalendarUrl } from "../app/lib/calendar";
import type { JourneyTask } from "../app/lib/types";

function task(scheduledAt: string): JourneyTask {
  return {
    id: "appointment",
    title: "Appointment",
    description: "",
    phase: "visa",
    status: "waiting",
    priority: "high",
    dueDate: "2026-09-09",
    scheduledAt,
    timeZone: "Asia/Taipei",
    predecessorIds: [],
    notes: "",
  };
}

test("creates calendar links from offset-bearing appointment times", () => {
  const url = new URL(googleCalendarUrl(task("2026-09-09T10:30:00+08:00")));
  assert.equal(url.searchParams.get("dates"), "20260909T103000/20260909T113000");
  assert.equal(url.searchParams.get("ctz"), "Asia/Taipei");
});

test("falls back to the due date when the appointment time is malformed", () => {
  const url = new URL(googleCalendarUrl(task("not-a-date")));
  assert.equal(url.searchParams.get("dates"), "20260909/20260910");
  assert.equal(url.searchParams.has("ctz"), false);
});
