import type { Bag, FlightAllowance, PackingItem } from "./types";

export interface BaggageEvaluation {
  ready: boolean;
  issues: string[];
  checkedWeightKg: number;
  strictCheckedLimitKg?: number;
}

export function bagWeightMap(bags: Bag[], packingItems: PackingItem[]): Map<string, number> {
  return new Map(bags.map((bag) => [
    bag.id,
    packingItems
      .filter((item) => item.bagId === bag.id)
      .reduce((sum, item) => sum + item.weightKg * item.quantity, 0),
  ]));
}

function activeBagWeights(kind: Bag["kind"], bags: Bag[], weights: Map<string, number>): number[] {
  return bags
    .filter((bag) => bag.kind === kind)
    .map((bag) => weights.get(bag.id) ?? 0);
}

function checkPieceRule(label: string, kindLabel: string, weights: number[], count: number, perPieceKg: number): string[] {
  const issues: string[] = [];
  if (weights.length > count) issues.push(`${label}：${kindLabel}目前有 ${weights.length} 件，超過 ${count} 件。`);
  weights.forEach((weight, index) => {
    if (weight > perPieceKg) issues.push(`${label}：第 ${index + 1} 件${kindLabel} ${weight.toFixed(1)}kg，超過每件 ${perPieceKg}kg。`);
  });
  return issues;
}

export function evaluateBaggageAllowances(
  bags: Bag[],
  packingItems: PackingItem[],
  allowances: FlightAllowance[],
): BaggageEvaluation {
  const weights = bagWeightMap(bags, packingItems);
  const checked = activeBagWeights("checked", bags, weights);
  const carryOn = activeBagWeights("carry-on", bags, weights);
  const personal = activeBagWeights("personal", bags, weights);
  const checkedWeightKg = checked.reduce((sum, weight) => sum + weight, 0);
  const complete = allowances.length > 0 && allowances.every((allowance) => allowance.confirmed
    && allowance.checkedMode !== "unknown"
    && allowance.carryOnMode !== "unknown"
    && allowance.personalItemMode !== "unknown");

  if (!complete) {
    return {
      ready: false,
      issues: allowances.length ? ["至少一個航段或行李類型仍待本人機票確認。"] : [],
      checkedWeightKg,
    };
  }

  const issues: string[] = [];
  const checkedLimits: number[] = [];
  allowances.forEach((allowance) => {
    const label = `${allowance.airline} ${allowance.segment}`.trim();
    if (allowance.checkedMode === "piece") {
      checkedLimits.push(allowance.checkedPieceCount * allowance.checkedPieceWeightKg);
      issues.push(...checkPieceRule(label, "托運", checked, allowance.checkedPieceCount, allowance.checkedPieceWeightKg));
    } else if (allowance.checkedMode === "weight") {
      checkedLimits.push(allowance.checkedTotalWeightKg);
      if (checkedWeightKg > allowance.checkedTotalWeightKg) issues.push(`${label}：托運合計 ${checkedWeightKg.toFixed(1)}kg，超過 ${allowance.checkedTotalWeightKg}kg。`);
    } else if (allowance.checkedMode === "none") {
      checkedLimits.push(0);
      if (checked.length) issues.push(`${label}：票面不含托運行李。`);
    }

    if (allowance.carryOnMode === "piece") {
      issues.push(...checkPieceRule(label, "手提", carryOn, allowance.carryOnPieceCount, allowance.carryOnPieceWeightKg));
    } else if (allowance.carryOnMode === "none" && carryOn.length) {
      issues.push(`${label}：票面不含手提行李。`);
    }

    if (allowance.personalItemMode === "piece") {
      issues.push(...checkPieceRule(label, "個人物品", personal, allowance.personalItemPieceCount, allowance.personalItemPieceWeightKg));
    } else if (allowance.personalItemMode === "none" && personal.length) {
      issues.push(`${label}：票面不含個人物品。`);
    }
  });

  return {
    ready: true,
    issues,
    checkedWeightKg,
    strictCheckedLimitKg: checkedLimits.length ? Math.min(...checkedLimits) : undefined,
  };
}
