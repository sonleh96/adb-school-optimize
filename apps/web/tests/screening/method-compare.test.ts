/**
 * Failure modes of compare mode's figures, read from the comparisons the API wrote for the fixtures:
 *  1. The screen shows the pair the other way round from the request (the app asks in one order), and the places
 *     under the two rules are swapped on screen.
 *  2. A comparison of other rules is drawn as if it were the pair on screen.
 *  3. Entrants and exits at the top k disagree with the overlap the API measured.
 *  4. A move sorts into the wrong bin at the edges (4 and 5, 14 and 15), or up and down are confused.
 *  5. A range school's possible places are lost or swapped with the pair.
 */
import { describe, expect, it } from "vitest";

import { compareFor, moveStep, topStatus } from "@/lib/screening/method/compare";
import { parseWith } from "@/lib/screening/schema";
import { type CompareResponse, type RuleId, compareResponse } from "@/lib/screening/types";

import { readFixture } from "./fixtures";

const read = (file: string): CompareResponse =>
  parseWith(compareResponse, readFixture(`compare/${file}.json`), file);
const S = "additive_u" as RuleId;
const NF = "need_first_u" as RuleId;
const pair = read("additive_u__need_first_u");

describe("compareFor", () => {
  it("turns the comparison to the screen's order (1)", () => {
    const forward = compareFor(pair, S, NF, 10);
    const back = compareFor(pair, NF, S, 10);
    const first = pair.ranks[0];
    const f = forward.rows.find((r) => r.key === first.school.school_key)!;
    const b = back.rows.find((r) => r.key === first.school.school_key)!;
    expect([f.a, f.b]).toEqual([first.rank_a, first.rank_b]);
    expect([b.a, b.b]).toEqual([first.rank_b, first.rank_a]);
    expect(b.d + f.d).toBe(0);
    expect(back.byA.map((r) => r.a)).toEqual([...back.byA.map((r) => r.a)].sort((x, y) => x - y));
  });

  it("refuses a comparison of other rules (2)", () => {
    expect(() => compareFor(pair, S, "benchmark" as RuleId, 10)).toThrow(/not additive_u and benchmark/);
  });

  it.each([10, 20])("has as many entrants and exits as the top %i lists do not share (3)", (k) => {
    for (const file of [
      "additive_u__need_first_u",
      "additive_u__benchmark",
      "need_first_u__bottleneck_no_u",
    ]) {
      const c = read(file);
      const shown = compareFor(c, c.run_a.rule_id, c.run_b.rule_id, k);
      const size = Math.min(k, shown.n);
      expect(shown.overlap).not.toBeNull();
      expect(shown.entrants).toHaveLength(size - shown.overlap!);
      expect(shown.exits).toHaveLength(size - shown.overlap!);
      for (const e of shown.entrants) expect([e.a > k, e.b <= k]).toEqual([true, true]);
    }
  });

  it("keeps each range school's possible places with its rule (5)", () => {
    const forward = compareFor(pair, S, NF, 10);
    const back = compareFor(pair, NF, S, 10);
    const school = pair.interval_schools![0];
    const f = forward.ranges.find((r) => r.key === school.school.school_key)!;
    const b = back.ranges.find((r) => r.key === school.school.school_key)!;
    expect(f.a).toEqual({ best: school.under_a.rank_best, worst: school.under_a.rank_worst });
    expect(b.b).toEqual(f.a);
    expect(b.a).toEqual(f.b);
  });
});

describe("moveStep and topStatus", () => {
  it.each([
    [0, 0],
    [4, 1],
    [5, 2],
    [14, 2],
    [15, 3],
    [-1, -1],
    [-5, -2],
    [-30, -3],
  ])("puts a move of %i places in bin %i (4)", (d, bin) => {
    expect(moveStep(d, [4, 14])).toBe(bin);
  });

  it("says whether a school joins, leaves or stays in the top k", () => {
    const row = (a: number, b: number) => ({ key: "k" as never, name: "", a, b, d: b - a });
    expect(topStatus(row(3, 12), 10)).toBe("leaves");
    expect(topStatus(row(12, 3), 10)).toBe("enters");
    expect(topStatus(row(3, 4), 10)).toBe("both");
    expect(topStatus(row(13, 14), 10)).toBeNull();
  });
});
