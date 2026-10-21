/**
 * The export sheet's preview of the top list file: the rows the API wrote, in the file's order, read as numbers once.
 * The sheet shows these; it never works a place or a score out again.
 */
import type { SchoolKey } from "../types";
import { type TopCsv, TopCsvError, recordValue } from "./top-csv";

export interface TopRow {
  readonly key: SchoolKey;
  /** The exact name in the file, which joins to the list; the screen shows the copy's display form of the school. */
  readonly name: string;
  readonly province: string | null;
  readonly kind: "point" | "range";
  /** A point row's place; null on a range row. */
  readonly place: number | null;
  /** A range row's possible places; null on a point row. */
  readonly best: number | null;
  readonly worst: number | null;
  readonly score: number | null;
  readonly scoreLower: number | null;
  readonly scoreUpper: number | null;
  /** The rule's school need (input N), which the need-first rules order by. */
  readonly need: number | null;
}

export interface TopList {
  readonly rule: string;
  readonly k: number;
  readonly point: readonly TopRow[];
  readonly range: readonly TopRow[];
  /** How many fingerprints the record carries (its `..._sha256` lines). */
  readonly fingerprints: number;
}

const number = (cell: string | null, column: string): number | null => {
  if (cell === null) return null;
  const value = Number(cell);
  if (!Number.isFinite(value))
    throw new TopCsvError(`${column} holds ${JSON.stringify(cell)}, not a number.`);
  return value;
};
const whole = (cell: string | null, column: string): number | null => {
  const value = number(cell, column);
  if (value !== null && !Number.isInteger(value))
    throw new TopCsvError(`${column} holds ${value}, not a place.`);
  return value;
};

export function topListOf(file: TopCsv): TopList {
  const rule = recordValue(file, "rule_id");
  const k = whole(recordValue(file, "k"), "k");
  if (rule === null || k === null) throw new TopCsvError("its record names no rule or no length.");
  const rows = file.rows.map((cells): TopRow => {
    const kind = cells.row_kind;
    if (kind !== "point" && kind !== "range")
      throw new TopCsvError(`a row's kind is ${JSON.stringify(kind)}.`);
    const key = cells.school_key;
    const name = cells.source_school_name;
    if (!key || name === null) throw new TopCsvError("a row has no school key or name.");
    return {
      key: key as SchoolKey,
      name,
      province: cells.province,
      kind,
      place: whole(cells.rank_point, "rank_point"),
      best: whole(cells.rank_best, "rank_best"),
      worst: whole(cells.rank_worst, "rank_worst"),
      score: number(cells.score_point, "score_point"),
      scoreLower: number(cells.score_lower, "score_lower"),
      scoreUpper: number(cells.score_upper, "score_upper"),
      need: number(cells.N, "N"),
    };
  });
  return {
    rule,
    k,
    point: rows.filter((r) => r.kind === "point"),
    range: rows.filter((r) => r.kind === "range"),
    fingerprints: file.record.filter((line) => line.key.endsWith("_sha256")).length,
  };
}

/** The file name the API gave in its Content-Disposition header, or null. */
export function fileNameOf(disposition: string | null): string | null {
  const match = disposition ? /filename="([^"]+)"/.exec(disposition) : null;
  return match ? match[1] : null;
}
