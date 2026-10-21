/**
 * Compare mode's figures, from the API's comparison of two rules. The API compares the schools both rules put in
 * order (the common cohort) and reports each one's place under each rule; nothing here re-ranks a school.
 *
 * The app asks for a pair in one order whichever way round the screen shows it, so the comparison is turned to
 * the screen's order first: `a` is the rule compared with (the left of the chart), `b` the rule compared.
 */
import type { CompareResponse, RuleId, SchoolKey } from "../types";

/** The edges that sort a move into its bin: 1 to 4 places, 5 to 14, 15 or more. The legend's labels use the same. */
export type MoveEdges = readonly [number, number];

export interface ComparedSchool {
  readonly key: SchoolKey;
  readonly name: string;
  /** The place under each rule, among the schools both rules put in order. */
  readonly a: number;
  readonly b: number;
  /** `b - a`: below zero the school moves up the list under `b`. */
  readonly d: number;
}

export interface RangeUnderBoth {
  readonly key: SchoolKey;
  readonly name: string;
  /** Possible places under each rule, or null where that rule has no result for the school. */
  readonly a: { readonly best: number; readonly worst: number } | null;
  readonly b: { readonly best: number; readonly worst: number } | null;
}

export interface Compared {
  readonly a: RuleId;
  readonly b: RuleId;
  /** How many places at the top are drawn in full; the rest are compressed. */
  readonly k: number;
  /** How many schools both rules put in order. */
  readonly n: number;
  readonly rows: readonly ComparedSchool[];
  readonly byA: readonly ComparedSchool[];
  readonly byB: readonly ComparedSchool[];
  /** In the top k under `b` and not under `a`, in `b`'s order; and the reverse, in `a`'s order. */
  readonly entrants: readonly ComparedSchool[];
  readonly exits: readonly ComparedSchool[];
  /** How many schools the two top k lists share, as the API measured it; null when it did not measure this k. */
  readonly overlap: number | null;
  readonly ranges: readonly RangeUnderBoth[];
}

/** The comparison as the screen shows it, `a` against `b`, with the top `k` drawn in full. */
export function compareFor(response: CompareResponse, a: RuleId, b: RuleId, k: number): Compared {
  const flipped = response.run_a.rule_id !== a;
  if (flipped ? response.run_b.rule_id !== a || response.run_a.rule_id !== b : response.run_b.rule_id !== b)
    throw new Error(
      `The comparison is of ${response.run_a.rule_id} and ${response.run_b.rule_id}, not ${a} and ${b}.`
    );
  const rows = response.ranks.map((r): ComparedSchool => {
    const ra = flipped ? r.rank_b : r.rank_a;
    const rb = flipped ? r.rank_a : r.rank_b;
    return { key: r.school.school_key, name: r.school.source_school_name, a: ra, b: rb, d: rb - ra };
  });
  const byA = [...rows].sort((x, y) => x.a - y.a);
  const byB = [...rows].sort((x, y) => x.b - y.b);
  const topA = new Set(byA.filter((r) => r.a <= k).map((r) => r.key));
  const topB = new Set(byB.filter((r) => r.b <= k).map((r) => r.key));
  const bounds = (u: { rank_best: number | null; rank_worst: number | null }) =>
    u.rank_best === null || u.rank_worst === null ? null : { best: u.rank_best, worst: u.rank_worst };
  return {
    a,
    b,
    k,
    n: response.common_cohort_count,
    rows,
    byA,
    byB,
    entrants: byB.filter((r) => r.b <= k && !topA.has(r.key)),
    exits: byA.filter((r) => r.a <= k && !topB.has(r.key)),
    overlap: response.metrics.top_k.find((t) => t.k === k)?.overlap ?? null,
    ranges: (response.interval_schools ?? []).map((s) => {
      const [ua, ub] = flipped ? [s.under_b, s.under_a] : [s.under_a, s.under_b];
      return { key: s.school.school_key, name: s.school.source_school_name, a: bounds(ua), b: bounds(ub) };
    }),
  };
}

/** A move's bin: 0 for none, then 1 to 3 by size, negative for a move up the list. */
export function moveStep(d: number, edges: MoveEdges): -3 | -2 | -1 | 0 | 1 | 2 | 3 {
  const m = Math.abs(d);
  const size = m === 0 ? 0 : m <= edges[0] ? 1 : m <= edges[1] ? 2 : 3;
  return (d < 0 ? -size : size) as -3 | -2 | -1 | 0 | 1 | 2 | 3;
}

/** Whether a school is in the top k under the first rule, the second, both or neither, for the card's line. */
export function topStatus(row: ComparedSchool, k: number): "both" | "enters" | "leaves" | null {
  const inA = row.a <= k;
  const inB = row.b <= k;
  return inA && inB ? "both" : inB ? "enters" : inA ? "leaves" : null;
}
