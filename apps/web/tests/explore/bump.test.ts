/**
 * Where the main method's top 20 sit under each of the seven rules (lib/explore/bump.ts). Failure modes, each with the
 * test that catches it:
 *  1. A school held for verification under a rule, or with no row in its list, is given a rank there
 *                                                   -> "reads each rule's own row: a rank, a range, not in the list ..."
 *  2. A range of possible ranks becomes one rank, or a rank of another scope is read as a rank
 *                                                   -> the same test
 *  3. The chart's schools are not the anchor's top 20 in order: a range school or a record to verify slips in, or
 *     rank 21 does                                  -> "holds the anchor's top 20 by rank ..."
 *  4. A line joins a rank to a range or to a missing school, so the line itself draws a rank that is not there
 *                                                   -> "joins two columns only where both give one rank"
 *  5. The count of schools in the top 20 under every rule counts a range that reaches past 20, a record to verify,
 *     or a missing result                            -> "counts a school as kept only when every rule ..."
 *  6. The marked school is lost when it is outside the top 20, drawn twice when inside, or drawn when the anchor
 *     does not put it in order                       -> "adds the marked school below the top 20 ..."
 *  7. The axis stops short of a rank it must draw, or a rule with no list is drawn as an empty column
 *                                                   -> "runs the axis to the longest list ..."
 */
import { describe, expect, it } from "vitest";

import { BUMP_RULES, TOP, bumpOf, inTop, joins, standingOf } from "@/lib/explore/bump";
import type { CopyRuleId } from "@/lib/screening/copy/model";
import { parseWith } from "@/lib/screening/schema";
import { type ResultsResponse, resultsResponse } from "@/lib/screening/types";

import { copy as clone, readFixture } from "../screening/fixtures";

const ANCHOR: CopyRuleId = "additive_no_u";
const listOf = (rule: CopyRuleId, change?: (raw: SavedList) => void): ResultsResponse => {
  const raw = clone(readFixture(`results/${rule}.json`)) as SavedList;
  change?.(raw);
  return parseWith(resultsResponse, raw, rule);
};
const listsOf = (change?: Partial<Record<CopyRuleId, (raw: SavedList) => void>>) =>
  new Map(BUMP_RULES.map((rule) => [rule, listOf(rule, change?.[rule])]));

/** The saved rows, read without the code under test. */
interface SavedRow {
  cohort: "complete" | "interval" | "verification_queue";
  school: { school_key: string };
  point_rank: { rank: number | null; scope_code: string };
  rank_bounds: { best: number | null; worst: number | null; scope_code: string };
}
interface SavedList {
  rows: SavedRow[];
}
const saved = (rule: CopyRuleId) => (readFixture(`results/${rule}.json`) as SavedList).rows;
const savedRow = (rule: CopyRuleId, key: string) => saved(rule).find((r) => r.school.school_key === key);

/** The anchor's top 20 as the requirement states it: one rank among its complete schools, 20 or better. */
const topKeys = () =>
  saved(ANCHOR)
    .filter((r) => r.cohort === "complete" && r.point_rank.rank! <= TOP)
    .sort((a, b) => a.point_rank.rank! - b.point_rank.rank!)
    .map((r) => r.school.school_key);

describe("standingOf", () => {
  it("reads each rule's own row: a rank, a range, not in the list, or no result", () => {
    const lists = listsOf();
    for (const rule of BUMP_RULES) {
      const rows = new Map(lists.get(rule)!.rows.map((row) => [row.school.school_key as string, row]));
      for (const row of saved(rule)) {
        const standing = standingOf(rows.get(row.school.school_key));
        if (row.cohort === "complete") expect(standing).toEqual({ kind: "rank", rank: row.point_rank.rank });
        else if (row.cohort === "interval")
          expect(standing).toEqual({
            kind: "range",
            best: row.rank_bounds.best,
            worst: row.rank_bounds.worst,
          });
        else expect(standing).toEqual({ kind: "out" });
      }
    }
    expect(standingOf(undefined)).toEqual({ kind: "none" });
    // A rank or a range that counts another group is no result, never a rank.
    const elsewhere = listOf(ANCHOR, (raw) => {
      for (const row of raw.rows) {
        if (row.cohort === "complete") row.point_rank.scope_code = "common_complete_cohort";
        if (row.cohort === "interval") row.rank_bounds.scope_code = "common_complete_cohort";
      }
    });
    const kinds = new Set(
      elsewhere.rows.filter((row) => row.cohort !== "verification_queue").map((row) => standingOf(row).kind)
    );
    expect([...kinds]).toEqual(["none"]);
  });
});

describe("bumpOf", () => {
  it("holds the anchor's top 20 by rank, and only schools with one rank there", () => {
    const bump = bumpOf(listsOf(), ANCHOR, null)!;
    expect(bump.schools.map((s) => s.id)).toEqual(topKeys());
    expect(bump.schools.every((s) => s.top)).toBe(true);
    expect(bump.rules).toEqual(BUMP_RULES);
    // A school ranked 20th is in it, last; one ranked 21st is not.
    const rankedAt = (rank: number) => {
      let key = "";
      const lists = listsOf({
        additive_no_u: (raw) => {
          const queued = raw.rows.find((r) => r.cohort === "verification_queue")!;
          key = queued.school.school_key;
          Object.assign(queued, {
            cohort: "complete",
            point_rank: { ...queued.point_rank, rank, scope_code: "complete_under_rule" },
            rank_bounds: { ...queued.rank_bounds, best: rank, worst: rank, scope_code: "eligible" },
          });
        },
      });
      return { key, ids: bumpOf(lists, ANCHOR, null)!.schools.map((s) => s.id) };
    };
    const twentieth = rankedAt(TOP);
    expect(twentieth.ids).toEqual([...topKeys(), twentieth.key]);
    expect(rankedAt(TOP + 1).ids).toEqual(topKeys());
  });

  it("counts a school as kept only when every rule puts it in the top 20 for certain", () => {
    const lists = listsOf();
    const bump = bumpOf(lists, ANCHOR, null)!;
    const certain = (rule: CopyRuleId, key: string) => {
      const row = savedRow(rule, key);
      if (!row) return false;
      if (row.cohort === "complete") return row.point_rank.rank! <= TOP;
      if (row.cohort === "interval") return row.rank_bounds.worst! <= TOP;
      return false;
    };
    const kept = topKeys().filter((key) => BUMP_RULES.every((rule) => certain(rule, key)));
    expect(bump.kept).toBe(kept.length);
    // The fixtures hold a top-20 school that is a record to verify under four rules: it is not kept.
    expect(kept.length).toBeLessThan(topKeys().length);

    // A range that reaches past 20 is not certain; one that stays inside it is.
    const key = topKeys()[0];
    const ranged = (worst: number) =>
      bumpOf(
        listsOf({
          need_first_u: (raw) => {
            const row = raw.rows.find((r) => r.school.school_key === key)!;
            Object.assign(row, {
              cohort: "interval",
              point_rank: { ...row.point_rank, rank: null },
              rank_bounds: { ...row.rank_bounds, best: 2, worst, scope_code: "eligible" },
            });
          },
        }),
        ANCHOR,
        null
      )!;
    expect(ranged(TOP + 1).kept).toBe(bump.kept - 1);
    expect(ranged(TOP).kept).toBe(bump.kept);
    expect(inTop({ kind: "range", best: 3, worst: TOP + 1 })).toBe(false);
    expect(inTop({ kind: "out" })).toBe(false);
    expect(inTop({ kind: "none" })).toBe(false);
  });

  it("adds the marked school below the top 20 when the anchor puts it in order, and never twice", () => {
    const lists = listsOf();
    const top = topKeys();
    const interval = saved(ANCHOR).find((r) => r.cohort === "interval")!.school.school_key;
    const queued = saved(ANCHOR).find((r) => r.cohort === "verification_queue")!.school.school_key;

    const withRange = bumpOf(lists, ANCHOR, interval)!;
    expect(withRange.schools.map((s) => s.id)).toEqual([...top, interval]);
    expect(withRange.schools.at(-1)!.top).toBe(false);
    const row = savedRow(ANCHOR, interval)!;
    expect(withRange.schools.at(-1)!.standings[0]).toEqual({
      kind: "range",
      best: row.rank_bounds.best,
      worst: row.rank_bounds.worst,
    });
    // Added below, it changes nothing the chart says about the top 20.
    expect(withRange.kept).toBe(bumpOf(lists, ANCHOR, null)!.kept);

    expect(bumpOf(lists, ANCHOR, top[3])!.schools.map((s) => s.id)).toEqual(top);
    expect(bumpOf(lists, ANCHOR, queued)!.schools.map((s) => s.id)).toEqual(top);
    expect(bumpOf(lists, ANCHOR, "no-such-school")!.schools.map((s) => s.id)).toEqual(top);
  });

  it("runs the axis to the longest list, and draws no column for a rule the page has no list for", () => {
    const lists = listsOf();
    const bump = bumpOf(lists, ANCHOR, null)!;
    for (const rule of BUMP_RULES) {
      const longest = Math.max(
        ...saved(rule).flatMap((r) => [r.point_rank.rank ?? 0, r.rank_bounds.worst ?? 0])
      );
      expect(bump.n, rule).toBeGreaterThanOrEqual(longest);
    }
    const fewer = new Map([...lists].filter(([rule]) => rule !== "benchmark"));
    const without = bumpOf(fewer, ANCHOR, null)!;
    expect(without.rules).toEqual(BUMP_RULES.filter((rule) => rule !== "benchmark"));
    expect(without.schools.every((s) => s.standings.length === without.rules.length)).toBe(true);
    expect(bumpOf(new Map([...lists].filter(([rule]) => rule !== ANCHOR)), ANCHOR, null)).toBeNull();
    expect(bump.anyOut).toBe(true);
  });
});

describe("joins", () => {
  it("joins two columns only where both give one rank", () => {
    const rank = (n: number) => ({ kind: "rank" as const, rank: n });
    expect(
      joins([
        rank(1),
        rank(3),
        { kind: "range", best: 2, worst: 9 },
        rank(4),
        { kind: "out" },
        rank(2),
        rank(2),
        { kind: "none" },
      ])
    ).toEqual([
      [
        { column: 0, rank: 1 },
        { column: 1, rank: 3 },
      ],
      [
        { column: 5, rank: 2 },
        { column: 6, rank: 2 },
      ],
    ]);
    expect(joins([rank(1)])).toEqual([]);
    expect(joins([])).toEqual([]);
  });
});
