/**
 * How the lists read: each ordered row's kind of place, where the ordered list's two notes go, and how the
 * incomplete records are grouped. The words of a place come from the copy (`rowPlace`), which adds the group a range
 * counts whenever the list also shows single places, so no bare number means two things (robustness R19).
 */
import type { OrderedRow } from "../list";

/** A single place, a range of places, or a range whose two ends meet (still a range school, shown with its group). */
export type PlaceForm = { kind: "point"; rank: number } | { kind: "range" } | { kind: "scoped" };

export function placeForm(row: OrderedRow): PlaceForm {
  if (row.cohort === "complete") return { kind: "point", rank: row.point_rank.rank };
  return row.rank_bounds.best === row.rank_bounds.worst ? { kind: "scoped" } : { kind: "range" };
}

/** The index of the first range row, before which the note on how range schools are placed goes; -1 for none. */
export const firstRangeIndex = (rows: readonly OrderedRow[]): number =>
  rows.findIndex((row) => row.cohort === "interval");

/**
 * The index of the last row of the first run of tied rows, after which the one sentence on ties goes; -1 when no
 * row is tied. `tied[i]` says whether row `i` carries a tie marker. A tie is always between neighbours, because tied
 * schools are ordered by name and sit together.
 */
export function tieNoteAfter(tied: readonly boolean[]): number {
  const start = tied.indexOf(true);
  if (start < 0) return -1;
  let end = start;
  while (end + 1 < tied.length && tied[end + 1]) end += 1;
  return end;
}

export interface RowGroup<R> {
  readonly heading: string;
  readonly rows: readonly R[];
}

/**
 * The incomplete records in groups. By province, the groups keep the order the API lists them in (province,
 * district, name). By what is missing, the largest group comes first, then by heading, so the commonest gap leads;
 * within a group the API's order holds. The arrow keys follow the rows in exactly this order.
 */
export function groupRows<R>(
  rows: readonly R[],
  headingOf: (row: R) => string,
  largestFirst: boolean
): RowGroup<R>[] {
  const groups = new Map<string, R[]>();
  for (const row of rows) {
    const heading = headingOf(row);
    const group = groups.get(heading);
    if (group) group.push(row);
    else groups.set(heading, [row]);
  }
  const out = [...groups].map(([heading, members]) => ({ heading, rows: members }));
  if (largestFirst)
    out.sort(
      (a, b) => b.rows.length - a.rows.length || (a.heading < b.heading ? -1 : a.heading > b.heading ? 1 : 0)
    );
  return out;
}
