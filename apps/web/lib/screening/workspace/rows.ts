/**
 * How the ordered list reads: each row's place, and where the list's two notes go.
 *
 * A place is one of three forms, decided here once so the row, the card and the tooltip agree:
 *  - `point`: one place among the schools with every input recorded ("3rd");
 *  - `range`: the highest and lowest place a school could take ("12th to 27th"), set stacked in the row;
 *  - `scoped`: a range school whose two ends are the same place. A bare "10th" would read like the complete school's
 *    "10th" beside it, though the two count among different groups, so the copy's headline carries its scope
 *    ("10th of 21") instead (robustness R19).
 */
import type { OrderedRow } from "../list";

export type PlaceForm = { kind: "point"; rank: number } | { kind: "range" } | { kind: "scoped" };

export function placeForm(row: OrderedRow): PlaceForm {
  if (row.cohort === "complete") return { kind: "point", rank: row.point_rank.rank };
  return row.rank_bounds.best === row.rank_bounds.worst ? { kind: "scoped" } : { kind: "range" };
}

/**
 * True when the list shows the same single number twice with two meanings: a range school whose ends meet at a
 * place counted among every school that can be put in order, and a complete school with that number counted among
 * the complete ones (the need-first rules do this). The scope detail then shows without a click (R19).
 */
export function scopesMix(rows: readonly OrderedRow[]): boolean {
  const points = new Set<number>();
  for (const row of rows) if (row.cohort === "complete") points.add(row.point_rank.rank);
  return rows.some(
    (row) =>
      row.cohort === "interval" &&
      row.rank_bounds.best === row.rank_bounds.worst &&
      points.has(row.rank_bounds.best)
  );
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
