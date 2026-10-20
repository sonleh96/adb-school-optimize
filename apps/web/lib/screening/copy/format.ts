/** Small formatting helpers the sentences share. All are pure. */
import type { NamedSchool } from "./model";

export function ordinal(n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new Error(`ordinal needs a positive integer, got ${n}`);
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const suffix = ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] || "th";
  return `${n}${suffix}`;
}

export const SMALL = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"] as const;
export const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
export const lowerFirst = (t: string): string => t.charAt(0).toLowerCase() + t.slice(1);

/** Groups thousands with commas. */
export function formatCount(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Three significant figures, grouped: 165178 -> "165,000". */
export function formatApprox(n: number): string {
  if (n === 0) return "0";
  const digits = Math.floor(Math.log10(Math.abs(n))) + 1;
  const factor = 10 ** Math.max(0, digits - 3);
  return formatCount(Math.round(n / factor) * factor);
}

/** A percentage with at most one decimal and no trailing ".0": 0.075 -> "7.5%". */
export function formatPercent(fraction: number): string {
  const v = Number((fraction * 100).toFixed(1));
  return `${Number.isInteger(v) ? v : v.toFixed(1)}%`;
}

/** Display only: trims and collapses repeated spaces ("Alder Junior High  School"). Joins use school.id. */
export const cleanName = (name: string): string => String(name).trim().replace(/\s+/g, " ");

export const displayName = (school: Pick<NamedSchool, "name">): string =>
  school.name == null || String(school.name).trim() === "" ? "Unnamed school" : cleanName(school.name);

export const joinList = (items: readonly string[], conj = "and"): string => {
  if (items.length === 0) throw new Error("joinList needs at least one item");
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ${conj} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} ${conj} ${items[items.length - 1]}`;
};

export const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/** A district or province as shown, or `null` when the record leaves it blank. */
export const cleanedOrNull = (value: string | null): string | null =>
  value == null || String(value).trim() === "" ? null : cleanName(value);
