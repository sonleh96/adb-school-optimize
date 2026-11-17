/**
 * A part's strip: the explore page's chart of one part of school need, shrunk to a single row beside the card's line
 * on how the school's record compares with the list. It holds the chart's own columns, so the strip and the line place
 * the school by the same figure (`partFigure`), among the same schools: those the card's rule puts in order. Under the
 * main rule that is the explore page's own list; under another rule the strip counts that rule's list, which the
 * explore page does not chart, so the card links to it only under the main rule. Its columns run the chart's way, from
 * the smallest figure to the largest, which is the way the line's "more" reads.
 */
import type { CopyRuleId, CopySchool, NeedKey } from "@/lib/screening/copy/model";

import { columnOf, partColumns } from "./parts";

/**
 * Where the strips show. First-time readers test the card with them; if the card reads worse than without, this one
 * value moves them off the card and into the method details, each beside its line again.
 */
export const STRIPS_SHOWN_IN: "card" | "method details" = "card";

export interface PartStrip {
  /** How many schools of the list each column of the part's chart holds, in the axis's order, the school included. */
  readonly counts: readonly number[];
  /** The column holding the school. */
  readonly at: number;
}

/**
 * The strip of the part `key` for `school` among the schools `schools` holds in order under `rule`, or null when the
 * school is in no column: it is not in that list, or its record gives no figure the chart can place. The school is
 * placed by its own record, the one its line compares, never by another copy of it in the list.
 */
export function partStrip(
  key: NeedKey,
  school: CopySchool,
  schools: readonly CopySchool[],
  rule: CopyRuleId
): PartStrip | null {
  const list = schools.some((s) => s.id === school.id)
    ? schools.map((s) => (s.id === school.id ? school : s))
    : [...schools, school];
  const chart = partColumns(key, list, rule);
  const at = columnOf(chart, school.id);
  return at === null ? null : { counts: chart.columns.map((column) => column.length), at };
}
