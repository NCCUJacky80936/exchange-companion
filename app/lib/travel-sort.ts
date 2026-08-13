import type { TravelPlan } from "./types";

export type TravelTemporalStatus = "upcoming" | "ongoing" | "past";

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function travelTemporalStatus(plan: TravelPlan, today: string): TravelTemporalStatus {
  if (plan.endDate < today) return "past";
  if (plan.startDate <= today) return "ongoing";
  return "upcoming";
}

export function sortTravelPlansForDisplay(plans: TravelPlan[], today: string): TravelPlan[] {
  return [...plans].sort((left, right) => {
    const leftStatus = travelTemporalStatus(left, today);
    const rightStatus = travelTemporalStatus(right, today);
    const rank = { ongoing: 0, upcoming: 1, past: 2 } as const;
    if (rank[leftStatus] !== rank[rightStatus]) return rank[leftStatus] - rank[rightStatus];
    if (leftStatus === "past") return right.endDate.localeCompare(left.endDate) || left.title.localeCompare(right.title, "zh-Hant");
    return left.startDate.localeCompare(right.startDate) || left.title.localeCompare(right.title, "zh-Hant");
  });
}
