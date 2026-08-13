import type { TravelPermission, TravelPlan } from "./types";

/**
 * Ownership is durable and always outranks a member or bearer-link grant.
 * The database owner ID is authoritative; callers should not infer ownership
 * from the permission returned by a share link.
 */
export function resolveTravelPermission(
  ownerId: string | undefined,
  currentUserId: string,
  grantedPermission: TravelPermission | undefined,
): TravelPermission | undefined {
  return ownerId === currentUserId ? "owner" : grantedPermission;
}

/**
 * Only fields that belong to the selected leisure trip may enter a shared row.
 * Keeping this explicit prevents private exchange state from leaking if TravelPlan
 * later gains unrelated properties.
 */
export function publicTravelPayload(plan: TravelPlan): TravelPlan {
  return {
    id: plan.id,
    kind: "travel",
    title: plan.title,
    destinations: [...plan.destinations],
    startDate: plan.startDate,
    endDate: plan.endDate,
    travelers: plan.travelers,
    budget: plan.budget,
    currency: plan.currency,
    notes: plan.notes,
    stays: (plan.stays ?? []).map((stay) => ({
      id: stay.id,
      name: stay.name,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      area: stay.area,
      address: stay.address,
      mapsUrl: stay.mapsUrl,
      sourceUrl: stay.sourceUrl,
      imageUrl: stay.imageUrl,
      imageAlt: stay.imageAlt,
      summary: stay.summary,
      highlights: [...stay.highlights],
      notes: stay.notes,
    })),
    references: (plan.references ?? []).map((reference) => ({
      id: reference.id,
      label: reference.label,
      kind: reference.kind,
      url: reference.url,
      description: reference.description,
    })),
    days: plan.days.map((day) => ({
      id: day.id,
      date: day.date,
      title: day.title,
      activities: day.activities.map((activity) => ({
        id: activity.id,
        time: activity.time,
        title: activity.title,
        kind: activity.kind,
        location: activity.location,
        mapsUrl: activity.mapsUrl,
        durationMinutes: activity.durationMinutes,
        cost: activity.cost,
        booked: activity.booked,
        notes: activity.notes,
      })),
    })),
    travelNotes: plan.travelNotes.map((note) => ({ id: note.id, title: note.title, details: note.details, category: note.category, important: note.important })),
    packingItems: plan.packingItems.map((item) => ({ id: item.id, name: item.name, category: item.category, quantity: item.quantity, packed: item.packed, notes: item.notes })),
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => item === undefined ? "null" : canonicalJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function matchesPublicTravelPayload(value: unknown, plan: TravelPlan): boolean {
  return canonicalJson(value) === canonicalJson(publicTravelPayload(plan));
}

function bytesToUuid(bytes: Uint8Array): string {
  const value = [...bytes.slice(0, 16)];
  value[6] = (value[6] & 0x0f) | 0x50;
  value[8] = (value[8] & 0x3f) | 0x80;
  const hex = value.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * A stable, user-scoped cloud ID makes retries idempotent without reusing the
 * local trip ID as a database key.
 */
export async function cloudPlanIdFor(plan: TravelPlan, userId: string): Promise<string> {
  if (plan.cloud?.cloudPlanId) return plan.cloud.cloudPlanId;
  if (plan.cloud?.published) return plan.id; // Compatibility with pre-mapping rows.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${userId}:${plan.id}`));
  return bytesToUuid(new Uint8Array(digest));
}
