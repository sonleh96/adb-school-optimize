export type WeightGroup = {
  label: string;
  entries: Array<{ key: string; value: string }>;
};

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
            value: formatWeightValue(numericValue),
          };
        })
        .filter((entry): entry is { key: string; value: string } => entry !== null);

      if (!entries.length) return null;
      return {
        label: startCase(groupKey),
        entries,
      };
    })
    .filter((group): group is WeightGroup => group !== null)
    .sort((left, right) => compareWeightGroups(left.label, right.label));
}

function startCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
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
