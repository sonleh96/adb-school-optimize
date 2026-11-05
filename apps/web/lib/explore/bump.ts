/**
 * The explore page's chart of the main method's top 20 under each of the seven rules: where each of those schools
 * sits under every rule, read from that rule's own list, and the lines that join its ranks.
 *
 * A school has one of four standings under a rule, as the API's cohorts say: one rank among the schools with every
 * input recorded; a range of possible ranks, when a figure the rule reads is missing; not in the list, a record to
 * verify under that rule; or no result, when the rule's list has no usable row for it. Only a rank is a point, and
 * only two ranks in neighbouring columns are joined, so the chart never invents a rank for a range or a missing school.
 * A rank counts only with the scope the adapter reads it with (`toResult` in the copy's adapter).
 */
import type { CopyRuleId } from "@/lib/screening/copy/model";
import type { ListedRow, ResultsResponse } from "@/lib/screening/types";

/** The size of the top list the paper reads first, and the chart follows: the top 20. */
export const TOP = 20;

/** The seven rules in the chart's order: the two combined-factors rules, then each other pair, the benchmark last. */
export const BUMP_RULES: readonly CopyRuleId[] = [
  "additive_no_u",
  "additive_u",
  "need_first_no_u",
  "need_first_u",
  "bottleneck_no_u",
  "bottleneck_u",
  "benchmark",
];

/**
 * The column group each rule's column sits under, named by the group's rule with urgency: each pair of rules, one
 * without the urgency rating and one with it, and the benchmark alone.
 */
export const GROUP_OF: Readonly<Record<CopyRuleId, CopyRuleId>> = {
  additive_no_u: "additive_u",
  additive_u: "additive_u",
  need_first_no_u: "need_first_u",
  need_first_u: "need_first_u",
  bottleneck_no_u: "bottleneck_u",
  bottleneck_u: "bottleneck_u",
  benchmark: "benchmark",
};

export type Standing =
  | { readonly kind: "rank"; readonly rank: number }
  | { readonly kind: "range"; readonly best: number; readonly worst: number }
  | { readonly kind: "out" }
  | { readonly kind: "none" };

/** Where a row of a rule's list puts its school, or no result when the list has no row for it. */
export function standingOf(row: ListedRow | undefined): Standing {
  if (!row) return { kind: "none" };
  switch (row.cohort) {
    case "complete":
      return row.point_rank.scope_code === "complete_under_rule"
        ? { kind: "rank", rank: row.point_rank.rank }
        : { kind: "none" };
    case "interval":
      return row.rank_bounds.scope_code === "eligible"
        ? { kind: "range", best: row.rank_bounds.best, worst: row.rank_bounds.worst }
        : { kind: "none" };
    case "verification_queue":
      return { kind: "out" };
  }
}

/** Certainly in the top `k`: a rank of `k` or better, or a range whose lowest rank is. */
export const inTop = (standing: Standing, k: number = TOP): boolean =>
  standing.kind === "rank" ? standing.rank <= k : standing.kind === "range" ? standing.worst <= k : false;

/** The lowest rank a standing reaches down the chart, or null when it has no rank. */
export const deepest = (standing: Standing): number | null =>
  standing.kind === "rank" ? standing.rank : standing.kind === "range" ? standing.worst : null;

export interface BumpSchool {
  readonly id: string;
  /** Its standing under each rule of the chart, in the chart's order. */
  readonly standings: readonly Standing[];
  /** In the anchor rule's top 20; false only for a marked school added below it. */
  readonly top: boolean;
}

export interface Bump {
  /** The rules drawn, in the chart's order: every rule of the seven whose list the page has. */
  readonly rules: readonly CopyRuleId[];
  /** The anchor's top 20 by rank, then the marked school when it is not among them. */
  readonly schools: readonly BumpSchool[];
  /** How many ranks the chart's axis runs to: the most schools any of the rules puts in order. */
  readonly n: number;
  /** How many of the anchor's top 20 are certainly in the top 20 under every rule drawn. */
  readonly kept: number;
  /** Whether any school drawn is not in some rule's list, so the chart needs the lane below its ranks. */
  readonly anyOut: boolean;
  /**
   * How many schools have a range of possible ranks under the anchor that reaches its top 20: the API's top list
   * gives them rows of their own after its ranked rows, and the chart holds them only when one is marked.
   */
  readonly reaching: number;
}

/**
 * The chart of `anchor`'s top 20 across the rules `lists` holds, with the school `marked` added when it is in the
 * anchor's list but not in its top 20. Null when the page has no list for the anchor.
 */
export function bumpOf(
  lists: ReadonlyMap<CopyRuleId, ResultsResponse>,
  anchor: CopyRuleId,
  marked: string | null
): Bump | null {
  const own = lists.get(anchor);
  if (!own) return null;
  const drawn = [anchor, ...BUMP_RULES.filter((rule) => rule !== anchor)].flatMap((rule) => {
    const list = lists.get(rule);
    return list ? [{ rule, list }] : [];
  });
  const rows = drawn.map(
    ({ list }) => new Map<string, ListedRow>(list.rows.map((row) => [row.school.school_key, row]))
  );
  const standingsOf = (id: string) => rows.map((byKey) => standingOf(byKey.get(id)));

  const ranked = own.rows
    .flatMap((row) => {
      const standing = standingOf(row);
      const id: string = row.school.school_key;
      return standing.kind === "rank" && standing.rank <= TOP ? [{ id, rank: standing.rank }] : [];
    })
    .sort((a, b) => a.rank - b.rank);
  const schools: BumpSchool[] = ranked.map(({ id }) => ({ id, standings: standingsOf(id), top: true }));
  if (marked !== null && !schools.some((s) => s.id === marked)) {
    const standings = standingsOf(marked);
    // Only a school the anchor puts in order: one with a rank below the top 20, or a range.
    if (standings[0].kind === "rank" || standings[0].kind === "range")
      schools.push({ id: marked, standings, top: false });
  }

  const counted = drawn.map(({ list }) =>
    Math.max(list.manifest.point_rank_count, list.manifest.rank_bounds_count)
  );
  const reached = schools.flatMap((s) => s.standings.map(deepest)).filter((d): d is number => d !== null);
  return {
    rules: drawn.map(({ rule }) => rule),
    schools,
    n: Math.max(TOP, ...counted, ...reached),
    kept: schools.filter((s) => s.top && s.standings.every((standing) => inTop(standing))).length,
    anyOut: schools.some((s) => s.standings.some((standing) => standing.kind === "out")),
    reaching: own.rows.filter((row) => {
      const standing = standingOf(row);
      return standing.kind === "range" && standing.best <= TOP;
    }).length,
  };
}

/** One end of a line: a column and the school's rank there. */
export interface LineEnd {
  readonly column: number;
  readonly rank: number;
}

/** The pieces of a school's line: one between each two neighbouring columns where both give it one rank. */
export function joins(standings: readonly Standing[]): [LineEnd, LineEnd][] {
  const out: [LineEnd, LineEnd][] = [];
  for (let column = 1; column < standings.length; column += 1) {
    const [a, b] = [standings[column - 1], standings[column]];
    if (a.kind === "rank" && b.kind === "rank")
      out.push([
        { column: column - 1, rank: a.rank },
        { column, rank: b.rank },
      ]);
  }
  return out;
}
