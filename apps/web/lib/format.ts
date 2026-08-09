/**
 * Shared formatters for tables and cards. Every numeric display should route
 * through these so units, precision, and the "n/a" fallback stay consistent.
 */

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Plain number with fixed fraction digits and thousands separators. */
export function formatNumber(value: unknown, digits = 1): string {
  const numeric = toFiniteNumber(value);
  if (numeric == null) return "n/a";
  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Integer with thousands separators. */
export function formatInteger(value: unknown): string {
  return formatNumber(value, 0);
}

/**
 * Percent. Accepts either a fraction (0-1) or an already-scaled value (>1);
 * fractions are multiplied by 100.
 */
export function formatPercent(value: unknown, digits = 1): string {
  const numeric = toFiniteNumber(value);
  if (numeric == null) return "n/a";
  const percent = numeric <= 1 ? numeric * 100 : numeric;
  return `${percent.toFixed(digits)}%`;
}

/** Score on a 0-100 scale (input is a 0-1 fraction). */
export function formatScore(value: unknown, digits = 1): string {
  const numeric = toFiniteNumber(value);
  if (numeric == null) return "n/a";
  return (numeric * 100).toFixed(digits);
}

export function formatCoordinate(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return value.toFixed(6);
}

/** Per-indicator unit-aware formatters. */
export const formatMbps = (value: unknown) => {
  const n = toFiniteNumber(value);
  return n == null ? "n/a" : `${formatNumber(n, 1)} Mbps`;
};

export const formatPopulation = (value: unknown) => formatInteger(value);

export const formatCount = (value: unknown) => formatInteger(value);
