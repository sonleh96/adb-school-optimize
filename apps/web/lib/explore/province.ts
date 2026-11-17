/**
 * Where the schools are: for each province, the schools in the list, how many of them are in the top 20, and the
 * records not in the list yet, by the reason they wait. The explore page's province bars and their tables read it.
 *
 * Every row of a rule's list counts exactly once, in its own province:
 *  - A school with a rank or a range of ranks is in the list.
 *  - The top 20 are the first 20 ranks among the schools with every input the rule reads (`point_rank.rank <= 20`),
 *    as the downloaded top list counts them. A school that shows a range has no single rank, so it counts in the list
 *    and never in the top 20, whatever its possible ranks.
 *  - A record to verify counts under the first reason that holds, in the paper's order: a core detail missing, then
 *    0 classrooms in total, then any other (`verifyGroupOf`, the app's own split). A record with both a missing detail
 *    and 0 classrooms counts once, with the missing detail, which gives the paper's 52 and 36.
 *
 * A province is the name the record gives, trimmed as the screen shows it; a blank one is `null`, its own row.
 */
import { verifyGroupOf } from "@/lib/screening/copy/adapter";
import { cleanedOrNull } from "@/lib/screening/copy/format";
import type { VerifyGroup } from "@/lib/screening/copy/model";
import type { ListedRow } from "@/lib/screening/types";

/** How long the top list is: ranks 1 to 20. */
export const TOP = 20;

/** The records of a province not in the list yet, by the first reason that holds. */
export interface NotYet {
  /** A detail school need is built from is missing, whatever else the record gives. */
  readonly missingField: number;
  /** Every such detail is there, and the record gives 0 classrooms in total. */
  readonly zeroClassrooms: number;
  /** Any other reason: a negative count, 0 teachers, a district figure, walking reach, a category off the scale. */
  readonly other: number;
}

export interface ProvinceCount {
  /** The province the records give, as the screen shows it, or null for the records that give none. */
  readonly province: string | null;
  /** The schools in the list: those with a rank or a range of ranks. */
  readonly inList: number;
  /** The schools in the list ranked 1 to 20 (`TOP`). */
  readonly top20: number;
  readonly notYet: NotYet;
}

const REASON: Readonly<Record<VerifyGroup, keyof NotYet>> = {
  missing: "missingField",
  zero: "zeroClassrooms",
  other: "other",
};

/** Named provinces from A to Z, then the records with no province, so a reader finds a province by its name. */
const byName = (a: ProvinceCount, b: ProvinceCount): number =>
  a.province === null
    ? b.province === null
      ? 0
      : 1
    : b.province === null
      ? -1
      : a.province.localeCompare(b.province, "en");

/** The province a row counts in, as `ProvinceCount.province` names it. */
export const provinceOf = (row: Pick<ListedRow, "school">): string | null =>
  cleanedOrNull(row.school.province);

/** The counts of each province a list's rows give, in the order the chart shows them (`byName`). */
export function provinceCounts(rows: readonly ListedRow[]): ProvinceCount[] {
  const counts = new Map<
    string | null,
    { inList: number; top20: number; notYet: Record<keyof NotYet, number> }
  >();
  for (const row of rows) {
    const province = provinceOf(row);
    let count = counts.get(province);
    if (!count) {
      count = { inList: 0, top20: 0, notYet: { missingField: 0, zeroClassrooms: 0, other: 0 } };
      counts.set(province, count);
    }
    switch (row.cohort) {
      case "complete":
        count.inList += 1;
        // A rank counts the schools complete under its rule only by its scope code, as every rank the screen shows.
        if (row.point_rank.scope_code === "complete_under_rule" && row.point_rank.rank <= TOP)
          count.top20 += 1;
        break;
      case "interval":
        count.inList += 1;
        break;
      case "verification_queue":
        count.notYet[REASON[verifyGroupOf(row)]] += 1;
        break;
    }
  }
  return [...counts].map(([province, count]) => ({ province, ...count })).sort(byName);
}

/** How many records of a province are not in the list yet, for every reason. */
export const waiting = (notYet: NotYet): number => notYet.missingField + notYet.zeroClassrooms + notYet.other;

/** Every province's counts added up: the table's last row, and the totals the page states. */
export function totalOf(counts: readonly ProvinceCount[]): Omit<ProvinceCount, "province"> {
  const sum = (count: (c: ProvinceCount) => number) => counts.reduce((total, c) => total + count(c), 0);
  return {
    inList: sum((c) => c.inList),
    top20: sum((c) => c.top20),
    notYet: {
      missingField: sum((c) => c.notYet.missingField),
      zeroClassrooms: sum((c) => c.notYet.zeroClassrooms),
      other: sum((c) => c.notYet.other),
    },
  };
}

/**
 * What the words under the chart say about ranks: how many schools of the list have a single rank, how many show a
 * range, and how many of those have possible ranks that reach the top 20 (a best rank of 20 or better among every
 * school that can be put in order, as the downloaded top list counts them).
 */
export function ranksOf(rows: readonly ListedRow[]): { complete: number; range: number; reach: number } {
  const ranges = rows.filter((row) => row.cohort === "interval");
  return {
    complete: rows.filter((row) => row.cohort === "complete").length,
    range: ranges.length,
    reach: ranges.filter((row) => row.rank_bounds.scope_code === "eligible" && row.rank_bounds.best <= TOP)
      .length,
  };
}
