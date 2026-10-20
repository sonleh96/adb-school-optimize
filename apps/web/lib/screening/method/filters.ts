/**
 * The method details' filters: a province and a remoteness class. A filter only hides rows and fades marks; it never
 * renumbers a place, so a row keeps the place it has in the rule's whole list.
 */
import type { ListedRow } from "../types";

export interface Filters {
  readonly prov: string | null;
  readonly loc: string | null;
}

export const filtering = (f: Filters): boolean => f.prov !== null || f.loc !== null;

export function admits(row: ListedRow, f: Filters): boolean {
  if (f.prov !== null && row.school.province !== f.prov) return false;
  if (f.loc !== null && row.school.locality !== f.loc) return false;
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
