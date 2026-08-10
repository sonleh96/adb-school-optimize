export type WeightGroup = {
  label: string;
  entries: Array<{ key: string; label: string; value: string }>;
};

export type WeightOverrides = Record<string, Record<string, number>>;

const WEIGHT_GROUP_ORDER = [
  "Need",
  "Impact",
  "Physical",
  "Priority",
  "School Need",
  "School Access",
  "Girls Bonus",
  "Practicality",
  "Admin Socio",
  "Admin Access",
  "Admin Context",
  "Admin Service",
  "Admin Conflict",
] as const;

const WEIGHT_LABEL_ALIASES: Record<string, string> = {
  S: "School Need",
  A: "Area Disadvantage",
  R_phys: "Physical / Resilience",
  I: "Impact Potential",
  P: "Practicality",
};

export function buildWeightGroups(weights: Record<string, unknown> | undefined): WeightGroup[] {
  if (!weights) return [];

  return Object.entries(weights)
    .map(([groupKey, groupValue]) => {
      if (!groupValue || typeof groupValue !== "object" || Array.isArray(groupValue)) return null;
      const entries = Object.entries(groupValue as Record<string, unknown>)
        .map(([entryKey, entryValue]) => {
          const numericValue = toFiniteNumber(entryValue);
          if (numericValue == null) return null;
          return {
            key: entryKey,
            label: displayWeightLabel(entryKey),
            value: formatWeightValue(numericValue),
          };
        })
        .filter((entry): entry is { key: string; label: string; value: string } => entry !== null);

      if (!entries.length) return null;
      return {
        label: startCase(groupKey),
        entries,
      };
    })
    .filter((group): group is WeightGroup => group !== null)
    .sort((left, right) => compareWeightGroups(left.label, right.label));
}

export function displayWeightLabel(key: string): string {
  return WEIGHT_LABEL_ALIASES[key] ?? key;
}

export function normalizeWeightOverrides(weights: unknown, fallback: WeightOverrides = {}): WeightOverrides {
  const normalized: WeightOverrides = {};
  const groups = weights && typeof weights === "object" && !Array.isArray(weights) ? weights : {};
  for (const [groupKey, groupValue] of Object.entries(groups as Record<string, unknown>)) {
    if (!groupValue || typeof groupValue !== "object" || Array.isArray(groupValue)) continue;
    const entries = Object.entries(groupValue as Record<string, unknown>)
      .map(([key, value]) => [key, toFiniteNumber(value)] as const)
      .filter((entry): entry is readonly [string, number] => entry[1] != null);
    if (!entries.length) continue;

    const sum = entries.reduce((total, [, value]) => total + value, 0);
    normalized[groupKey] = Object.fromEntries(
      entries.map(([key, value]) => [key, sum > 0 ? value / sum : 1 / entries.length])
    );
  }

  if (Object.keys(normalized).length) return normalized;
  return Object.keys(fallback).length ? normalizeWeightOverrides(fallback, {}) : {};
}

function startCase(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatWeightValue(value: number): string {
  if (value >= 0 && value <= 1) {
    return `${(value * 100).toFixed(1)}%`;
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function compareWeightGroups(left: string, right: string): number {
  const leftIndex = WEIGHT_GROUP_ORDER.indexOf(left as (typeof WEIGHT_GROUP_ORDER)[number]);
  const rightIndex = WEIGHT_GROUP_ORDER.indexOf(right as (typeof WEIGHT_GROUP_ORDER)[number]);

  if (leftIndex === -1 && rightIndex === -1) {
    return left.localeCompare(right);
  }
  if (leftIndex === -1) return 1;
  if (rightIndex === -1) return -1;
  return leftIndex - rightIndex;
}
