/**
 * Which schools the screen shows. The find control on the plain screen sets a province, a district in it and part of
 * a school's name; the method details add a remoteness class and, for the records to verify, a part of school need
 * they lack. A filter only hides rows and fades marks. It never renumbers a rank, so a row keeps the rank it has in
 * the rule's whole list, and the downloads and the printout show the same rows.
 */
import type { ListedRow } from "./types";
import type { MissingDetail } from "./workspace/state";

export interface Filters {
  readonly prov: string | null;
  /** A district of `prov`; the state never holds one without its province. */
  readonly dist: string | null;
  /** Part of a school's name, as typed. */
  readonly q: string | null;
  readonly loc: string | null;
  /** Applies to the records to verify only; absent means none. */
  readonly miss?: MissingDetail | null;
}

/** No filter at all: every row shows. */
export const NO_FILTERS: Filters = Object.freeze({ prov: null, dist: null, q: null, loc: null, miss: null });

/** Text as the name search compares it: accents dropped, lower case, runs of spaces as one. */
const searchText = (text: string): string =>
  text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** What the name search looks for, or null when what was typed holds nothing to look for. */
export function nameQuery(q: string | null): string | null {
  const text = q === null ? "" : searchText(q);
  return text === "" ? null : text;
}

/** The find control holds a province, a district or a name: the plain screen is filtered. */
export const finding = (f: Pick<Filters, "prov" | "dist" | "q">): boolean =>
  f.prov !== null || f.dist !== null || nameQuery(f.q) !== null;
/** A filter that applies to every list is set: the find control's, or the method details' remoteness. */
export const filtering = (f: Filters): boolean => finding(f) || f.loc !== null;
/** Any filter is set, the one by what is missing included. */
export const filteringAny = (f: Filters): boolean => filtering(f) || (f.miss ?? null) !== null;

/** A record to verify lacks a part of school need when its record leaves that part out. */
export const lacks = (row: ListedRow, detail: MissingDetail): boolean =>
  row.cohort === "verification_queue" && row.need_parts[detail] == null;

export function admits(row: ListedRow, f: Filters): boolean {
  if (f.prov !== null && row.school.province !== f.prov) return false;
  if (f.dist !== null && row.school.district !== f.dist) return false;
  const name = nameQuery(f.q);
  if (name !== null && !searchText(row.school.source_school_name).includes(name)) return false;
  if (f.loc !== null && row.school.locality !== f.loc) return false;
  if (f.miss && row.cohort === "verification_queue" && !lacks(row, f.miss)) return false;
  return true;
}

export interface FilterOptions {
  readonly provinces: readonly string[];
  /** Each province's districts, in reading order. */
  readonly places: ReadonlyMap<string, readonly string[]>;
  readonly localities: readonly string[];
}

const usable = (value: string | null | undefined): value is string =>
  typeof value === "string" && value.trim() !== "";
const sorted = (values: Iterable<string>): string[] =>
  [...new Set(values)].sort((a, b) => a.localeCompare(b));

/** The provinces, their districts and the remoteness classes the list holds, each once, in reading order. Blanks are not options. */
export function filterOptions(rows: readonly ListedRow[]): FilterOptions {
  const districts = new Map<string, string[]>();
  for (const { school } of rows) {
    if (!usable(school.province)) continue;
    const list = districts.get(school.province) ?? [];
    if (usable(school.district)) list.push(school.district);
    districts.set(school.province, list);
  }
  const provinces = sorted(districts.keys());
  return {
    provinces,
    places: new Map(provinces.map((p) => [p, sorted(districts.get(p) ?? [])])),
    localities: sorted(rows.map((r) => r.school.locality).filter(usable)),
  };
}
