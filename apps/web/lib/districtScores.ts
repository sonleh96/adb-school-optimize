import type { DistrictRecord } from "@/lib/types";

export type DistrictScoreField = "priority" | "need";

export function getDistrictScore(feature: DistrictRecord, field: DistrictScoreField): number | null {
  const value = field === "priority" ? feature.priority : feature.need;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function sortDistrictsByScore(features: DistrictRecord[], field: DistrictScoreField): DistrictRecord[] {
  return [...features].sort((left, right) => {
    const leftValue = getDistrictScore(left, field);
    const rightValue = getDistrictScore(right, field);

    if (leftValue == null && rightValue == null) {
      return left.district.localeCompare(right.district) || left.province.localeCompare(right.province);
    }
    if (leftValue == null) return 1;
    if (rightValue == null) return -1;
    if (rightValue !== leftValue) return rightValue - leftValue;
    return left.district.localeCompare(right.district) || left.province.localeCompare(right.province);
  });
}

export function getTopDistrictIds(
  features: DistrictRecord[],
  field: DistrictScoreField,
  count: number
): Set<string> {
  if (count <= 0) return new Set();
  return new Set(
    sortDistrictsByScore(features, field)
      .filter((feature) => getDistrictScore(feature, field) != null)
      .slice(0, count)
      .map((feature) => feature.district_id)
  );
}

export function scoreExtent(features: DistrictRecord[], field: DistrictScoreField): { min: number; max: number } {
  const values = features.map((feature) => getDistrictScore(feature, field)).filter((value): value is number => value != null);
  return {
    min: values.length ? Math.min(...values) : 0,
    max: values.length ? Math.max(...values) : 1,
  };
}
