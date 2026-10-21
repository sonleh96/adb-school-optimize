/**
 * The method details' filters: a province, a remoteness class, and for the incomplete records the part of school
 * need they lack. A filter only hides rows and fades marks; it never renumbers a place, so a row keeps the place it
 * has in the rule's whole list.
 */
import type { ListedRow } from "../types";
import type { MissingDetail } from "../workspace/state";

export interface Filters {
  readonly prov: string | null;
  readonly loc: string | null;
  /** Applies to the incomplete records only; absent means none. */
  readonly miss?: MissingDetail | null;
}

/** A province or remoteness filter is set: they apply to every list. */
export const filtering = (f: Filters): boolean => f.prov !== null || f.loc !== null;
/** Any filter is set, the one by what is missing included. */
export const filteringAny = (f: Filters): boolean => filtering(f) || (f.miss ?? null) !== null;

/** An incomplete record lacks a part of school need when its record leaves that part out. */
export const lacks = (row: ListedRow, detail: MissingDetail): boolean =>
  row.cohort === "verification_queue" && row.need_parts[detail] == null;

export function admits(row: ListedRow, f: Filters): boolean {
  if (f.prov !== null && row.school.province !== f.prov) return false;
  if (f.loc !== null && row.school.locality !== f.loc) return false;
  if (f.miss && row.cohort === "verification_queue" && !lacks(row, f.miss)) return false;
  return true;
}

/** The provinces and remoteness classes the list holds, each once, in reading order. Blanks are not options. */
export function filterOptions(rows: readonly ListedRow[]): { provinces: string[]; localities: string[] } {
  const values = (pick: (row: ListedRow) => string | null) =>
    [...new Set(rows.map(pick).filter((v): v is string => v !== null && v.trim() !== ""))].sort((a, b) =>
      a.localeCompare(b)
    );
  return { provinces: values((r) => r.school.province), localities: values((r) => r.school.locality) };
}
