/**
 * Pure helpers over the parsed rows: how the API's one list splits into the ordered list and the incomplete
 * records, what place a school is shown with, and how selection follows the rows.
 * Nothing here sorts. The order is the API's display order, and every function keeps it.
 */
import type { CompleteRow, IntervalRow, ListedRow, QueuedRow, SchoolKey } from "./types";

export type OrderedRow = CompleteRow | IntervalRow;

export interface SplitRows {
  /** Complete and interval schools, interleaved as the API displays them. */
  ordered: OrderedRow[];
  /** Schools held back because their record is incomplete, in the API's order. */
  incomplete: QueuedRow[];
}

export function splitRows(rows: readonly ListedRow[]): SplitRows {
  const ordered: OrderedRow[] = [];
  const incomplete: QueuedRow[] = [];
  for (const row of rows) {
    if (row.cohort === "verification_queue") incomplete.push(row);
    else ordered.push(row);
  }
  return { ordered, incomplete };
}

/** Where a school stands: one exact place, a range of possible places, or none. */
export type Place =
  | { kind: "point"; rank: number; of: number }
  | { kind: "range"; best: number; worst: number; of: number }
  | { kind: "none" };

export function placeOf(row: ListedRow): Place {
  switch (row.cohort) {
    case "complete":
      return { kind: "point", rank: row.point_rank.rank, of: row.point_rank.count };
    case "interval":
      return {
        kind: "range",
        best: row.rank_bounds.best,
        worst: row.rank_bounds.worst,
        of: row.rank_bounds.count,
      };
    case "verification_queue":
      return { kind: "none" };
    default:
      return assertNever(row);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${JSON.stringify(value)}`);
}

export function ordinal(n: number): string {
  const lastTwo = n % 100;
  const suffix =
    lastTwo >= 11 && lastTwo <= 13
      ? "th"
      : (({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th");
  return `${n}${suffix}`;
}

/** "3rd", or "12th to 27th" for a range. Equal bounds read as one place. Empty when the school has none. */
export function placeLabel(place: Place): string {
  switch (place.kind) {
    case "point":
      return ordinal(place.rank);
    case "range":
      return place.best === place.worst
        ? ordinal(place.best)
        : `${ordinal(place.best)} to ${ordinal(place.worst)}`;
    case "none":
      return "";
  }
}

export type ListTab = "ordered" | "incomplete";

export function tabOf(row: ListedRow): ListTab {
  return row.cohort === "verification_queue" ? "incomplete" : "ordered";
}

export interface ProvinceGroup {
  province: string | null;
  rows: QueuedRow[];
}

/** Groups in order of first appearance, rows in their given order. A missing province is its own group. */
export function groupByProvince(rows: readonly QueuedRow[]): ProvinceGroup[] {
  const groups = new Map<string | null, QueuedRow[]>();
  for (const row of rows) {
    const key = row.school.province;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return [...groups].map(([province, members]) => ({ province, rows: members }));
}

/** The selected school if the rows still hold it, otherwise nothing. */
export function reconcileSelection(selected: SchoolKey | null, rows: readonly ListedRow[]): SchoolKey | null {
  if (selected === null) return null;
  return rows.some((row) => row.school.school_key === selected) ? selected : null;
}

/** The key `delta` places from `from` in `rows`, stopping at either end. The first row when nothing is selected. */
export function neighbour(
  rows: readonly ListedRow[],
  from: SchoolKey | null,
  delta: 1 | -1
): SchoolKey | null {
  if (rows.length === 0) return null;
  const index = rows.findIndex((row) => row.school.school_key === from);
  if (index < 0) return rows[delta === 1 ? 0 : rows.length - 1].school.school_key;
  const next = Math.min(rows.length - 1, Math.max(0, index + delta));
  return rows[next].school.school_key;
}
