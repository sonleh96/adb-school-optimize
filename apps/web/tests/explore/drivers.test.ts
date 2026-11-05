/**
 * What puts a school in the top 20 (lib/explore/drivers.ts), on the API's own responses for invented schools. Failure
 * modes, each with the test that catches it:
 *  1. The parts sit in another order than the diagram of each part's share, or a part is named twice or left out
 *                                         -> "orders the parts as the diagram does ..."
 *  2. A bar's parts do not add up to its school's score, or a list whose parts do not add up is drawn anyway
 *                                         -> "every bar's parts add up to its score ..."
 *  3. A range school is drawn as a point: its bar ends at one score, or its missing figure sits among the recorded parts
 *                                         -> "a range school's bar runs from its lower score to its upper ..."
 *  4. Float noise reads as a gap, an exact tie reads as a gap, or a close call reads as a tie
 *                                         -> "a tie reads as a tie, float noise included ..."
 *  5. A rule whose score is not its parts added up gets bars
 *                                         -> "a rule whose score is not its parts added up gets no bars"
 *  6. The top 20 holds a school it should not, a range school that reaches it is missing, or the gaps stop short of
 *     the 22nd or run past it            -> "holds the top 20 and the range schools that reach it ..."
 *  7. The marked school outside the top 20 has no bar, or one inside it is drawn twice
 *                                         -> "draws the marked school outside the top 20 on its own"
 *  8. A sentence's count is wrong: school need said to lead where the other inputs could match it, or a part said to
 *     add the most when another does so as often
 *                                         -> "counts school need as leading only when nothing else could reach it" and
 *                                            "names every part that adds the most equally often"
 *  9. The scale cuts a bar short, or adds a tenth that float rounding invents
 *                                         -> "the scale reaches the largest score ..."
 */
import { describe, expect, it } from "vitest";

import {
  type Bar,
  CLOSE_CALL,
  type Drivers,
  PAST,
  TOP,
  drawnOf,
  driversOf,
  edgeOf,
  gapKind,
  largestParts,
  needLeads,
  scaleOf,
} from "@/lib/explore/drivers";
import { SAME_SCORE } from "@/lib/screening/copy/rank";
import { placeOf } from "@/lib/screening/list";
import { parseWith } from "@/lib/screening/schema";
import { type ListedRow, type Rule, resultsResponse, rulesResponse } from "@/lib/screening/types";

import { type Dataset, copy, readFixture } from "../screening/fixtures";

const NEED = [
  "permanent_classroom_deficit",
  "teacher_housing_deficit",
  "facility_presence_deficit",
  "service_deficit",
  "locality_disadvantage",
] as const;

const rulesOf = (dataset: Dataset = "") =>
  parseWith(rulesResponse, readFixture("rules.json", dataset), "rules");
const ruleOf = (id: string, dataset: Dataset = ""): Rule =>
  rulesOf(dataset).rules.find((r) => r.rule_id === id)!;
const rowsOf = (id: string, dataset: Dataset = ""): ListedRow[] =>
  parseWith(resultsResponse, readFixture(`results/${id}.json`, dataset), id).rows;
const nameOf = (rows: readonly ListedRow[], id: string) =>
  rows.find((r) => r.school.school_key === id)!.school.source_school_name;
const keyOf = (rows: readonly ListedRow[], name: string) =>
  rows.find((r) => r.school.source_school_name === name)!.school.school_key;

function partsOf(drivers: Drivers) {
  if (drivers.kind !== "parts") throw new Error(`expected bars, got ${drivers.kind}`);
  return drivers;
}

describe("driversOf", () => {
  it("orders the parts as the diagram does: school need's five parts, then each other input in the rule's order", () => {
    // The paper's rules: S0 = (0.60N + 0.15A + 0.05R + 0.05Q + 0.05E + 0.05L) / 0.95, S puts 0.05U after A, and
    // B = 0.55N + 0.20A + 0.15U + 0.10R. School need is the mean of its five parts, in the engine's order.
    const expected: Record<string, string[]> = {
      additive_no_u: [...NEED, "A", "R", "Q", "E", "L"],
      additive_u: [...NEED, "A", "U", "R", "Q", "E", "L"],
      benchmark: [...NEED, "A", "U", "R"],
    };
    for (const [id, pieces] of Object.entries(expected)) {
      const drivers = partsOf(driversOf(ruleOf(id), rowsOf(id), null));
      expect(drivers.pieces, id).toEqual(pieces);
      for (const bar of drivers.bars)
        expect(
          bar.segments.map((s) => s.piece),
          id
        ).toEqual(pieces);
    }
  });

  it("every bar's parts add up to its score, and a list whose parts do not is not drawn", () => {
    for (const [id, dataset] of [
      ["additive_no_u", "drivers"],
      ["additive_u", "drivers"],
      ["additive_no_u", ""],
      ["additive_no_u", "ties-and-ranges"],
    ] as const) {
      const { bars } = partsOf(driversOf(ruleOf(id, dataset), rowsOf(id, dataset), null));
      expect(bars.length).toBeGreaterThan(0);
      for (const bar of bars) {
        const sum = (end: "lower" | "upper") => bar.segments.reduce((total, s) => total + s[end], 0);
        expect(Math.abs(sum("lower") - bar.lower), `${dataset} ${id}`).toBeLessThan(SAME_SCORE);
        expect(Math.abs(sum("upper") - bar.upper), `${dataset} ${id}`).toBeLessThan(SAME_SCORE);
      }
    }

    const rule = ruleOf("additive_no_u", "drivers");
    const broken = (change: (row: ListedRow) => void) => {
      const rows = copy(rowsOf("additive_no_u", "drivers"));
      change(rows.find((r) => r.cohort === "complete" && r.point_rank.rank === 3)!);
      return driversOf(rule, rows, null).kind;
    };
    // A part a millionth off its score is a list that does not add up; float noise a ten-trillionth off is not.
    expect(broken((row) => (row.need_part_contributions!.service_deficit! += 1e-6))).toBe("unreadable");
    expect(broken((row) => (row.need_part_contributions!.service_deficit! += 1e-13))).toBe("parts");
    // A part the list leaves out.
    expect(broken((row) => (row.need_part_contributions!.teacher_housing_deficit = null))).toBe("unreadable");
    expect(broken((row) => (row.contributions = row.contributions.filter((c) => c.component !== "Q")))).toBe(
      "unreadable"
    );
  });

  it("a range school's bar runs from its lower score to its upper, the missing figure last and hollow", () => {
    const rows = rowsOf("additive_no_u", "drivers");
    const rule = ruleOf("additive_no_u", "drivers");
    const { bars } = partsOf(driversOf(rule, rows, null));
    const air = bars.find((bar) => bar.id === keyOf(rows, "Range Air"))!;
    expect(air.place.kind).toBe("range");
    expect(air.upper - air.lower).toBeGreaterThan(0.01);

    const drawn = drawnOf(air);
    const recorded = drawn.filter((d) => d.recorded);
    const hollow = drawn.filter((d) => !d.recorded);
    // Every recorded part first, in the diagram's order, so the solid bar ends at the lower score.
    expect(drawn.slice(0, recorded.length)).toEqual(recorded);
    expect(recorded.map((d) => d.piece)).toEqual(air.segments.filter((s) => s.lower > 0).map((s) => s.piece));
    expect(Math.abs(recorded.at(-1)!.to - air.lower)).toBeLessThan(SAME_SCORE);
    // Then the air-quality figure the record leaves blank, as far as its whole share: the rule's own share, not typed in.
    const share = rule.weights.find((w) => w.component === "Q")!.value;
    expect(hollow.map((d) => d.piece)).toEqual(["Q"]);
    expect(Math.abs(hollow[0].to - hollow[0].from - share)).toBeLessThan(SAME_SCORE);
    expect(Math.abs(drawn.at(-1)!.to - air.upper)).toBeLessThan(SAME_SCORE);

    // A school with every figure recorded has nothing hollow, and its bar ends at its one score.
    for (const bar of bars.filter((b) => b.place.kind === "point")) {
      expect(drawnOf(bar).every((d) => d.recorded)).toBe(true);
      expect(bar.lower).toBe(bar.upper);
    }
  });

  it("a tie reads as a tie, float noise included, and a close call never does", () => {
    // The coordination note's case: the engine halves 0.7 + 0.2 to 0.44999999999999996 and 0.4 + 0.5 to 0.45.
    const generator = (0.7 + 0.2) / 2;
    const solar = (0.4 + 0.5) / 2;
    expect(generator).not.toBe(solar);
    expect(gapKind(solar - generator)).toBe("tie");
    expect(gapKind(0)).toBe("tie");
    expect(gapKind(SAME_SCORE / 2)).toBe("tie");
    expect(gapKind(SAME_SCORE)).toBe("close");
    expect(gapKind(2.2e-5)).toBe("close");
    expect(gapKind(CLOSE_CALL - 1e-6)).toBe("close");
    expect(gapKind(CLOSE_CALL)).toBe("clear");

    // The same in the engine's own list: an exact tie, a tie only floating point splits, and close calls.
    const rows = rowsOf("additive_no_u", "drivers");
    const { gaps } = partsOf(driversOf(ruleOf("additive_no_u", "drivers"), rows, null));
    const between = (a: string, b: string) =>
      gaps.find((g) => nameOf(rows, g.above.id) === a && nameOf(rows, g.below.id) === b)!;
    expect(between("Level Alpha", "Level Bravo")).toMatchObject({ size: 0, kind: "tie" });
    const noise = between("Noise Solar", "Noise Generator");
    expect(noise.size).toBeGreaterThan(0);
    expect(noise.kind).toBe("tie");
    expect(between("Close Two", "Close One").kind).toBe("close");
    expect(gaps.filter((g) => g.kind === "tie")).toHaveLength(2);
  });

  it("a rule whose score is not its parts added up gets no bars", () => {
    // The rows of every rule carry contributions, a largest-factor rule's school need parts included.
    expect(rowsOf("bottleneck_no_u").some((r) => r.need_part_contributions !== null)).toBe(true);
    expect(driversOf(ruleOf("need_first_no_u"), rowsOf("need_first_no_u"), null)).toEqual({
      kind: "need-first",
    });
    expect(driversOf(ruleOf("need_first_u"), rowsOf("need_first_u"), null)).toEqual({ kind: "need-first" });
    expect(driversOf(ruleOf("bottleneck_no_u"), rowsOf("bottleneck_no_u"), null)).toEqual({
      kind: "largest",
      of: ["N", "A"],
    });
    expect(driversOf(ruleOf("bottleneck_u"), rowsOf("bottleneck_u"), null)).toEqual({
      kind: "largest",
      of: ["N", "A", "U"],
    });
    // A rule that does not say how it combines its inputs.
    const silent = { ...ruleOf("additive_no_u"), maximum_share: undefined };
    expect(driversOf(silent, rowsOf("additive_no_u"), null)).toEqual({ kind: "unreadable" });
  });

  it("holds the top 20 and the range schools that reach it, in the list's order, and the gaps to the 22nd", () => {
    const rows = rowsOf("additive_no_u", "drivers");
    const { bars, gaps } = partsOf(driversOf(ruleOf("additive_no_u", "drivers"), rows, null));
    const expected = rows.filter(
      (r) =>
        (r.cohort === "complete" && r.point_rank.rank <= TOP) ||
        (r.cohort === "interval" && r.rank_bounds.best <= TOP)
    );
    expect(bars.map((b) => b.id)).toEqual(expected.map((r) => r.school.school_key));
    expect(bars.filter((b) => b.place.kind === "point")).toHaveLength(TOP);
    // The range whose ranks cross the 20th is in; every school with one rank below the 20th is out.
    expect(bars.map((b) => nameOf(rows, b.id))).toEqual(expect.arrayContaining(["Range Air", "Range Edge"]));
    const edge = bars.find((b) => nameOf(rows, b.id) === "Range Edge")!.place;
    expect(edge.kind === "range" && edge.best <= TOP && edge.worst > TOP).toBe(true);

    expect(gaps.map((g) => [g.above.rank, g.below.rank])).toEqual(
      Array.from({ length: TOP + PAST - 1 }, (_, i) => [i + 1, i + 2])
    );
    for (const gap of gaps) expect(gap.size).toBe(gap.above.score - gap.below.score);
    expect(edgeOf(gaps)).toMatchObject({ above: { rank: 20 }, below: { rank: 21 } });

    // A list with 17 schools with one rank: every pair of them, and no edge of the top 20.
    const short = partsOf(driversOf(ruleOf("additive_no_u"), rowsOf("additive_no_u"), null));
    expect(short.gaps).toHaveLength(16);
    expect(edgeOf(short.gaps)).toBeNull();
    expect(short.bars.every((b) => rowsOf("additive_no_u").some((r) => r.school.school_key === b.id))).toBe(
      true
    );
  });

  it("draws the marked school outside the top 20 on its own, and nothing extra for one inside it", () => {
    const rows = rowsOf("additive_no_u", "drivers");
    const rule = ruleOf("additive_no_u", "drivers");
    const far = rows.find((r) => r.cohort === "complete" && r.point_rank.rank === 24)!.school.school_key;
    const marked = partsOf(driversOf(rule, rows, far));
    expect(marked.outside?.id).toBe(far);
    expect(marked.bars.map((b) => b.id)).not.toContain(far);
    expect(placeOf(rows.find((r) => r.school.school_key === far)!)).toEqual(marked.outside?.place);

    const inside = keyOf(rows, "Driver 17");
    expect(partsOf(driversOf(rule, rows, inside)).outside).toBeNull();
    expect(partsOf(driversOf(rule, rows, "no-such-school")).outside).toBeNull();
    // A school waiting to be verified is not in the list, so it has no bar anywhere.
    const main = rowsOf("additive_no_u");
    const queued = main.find((r) => r.cohort === "verification_queue")!.school.school_key;
    expect(partsOf(driversOf(ruleOf("additive_no_u"), main, queued)).outside).toBeNull();
  });
});

/** A bar from parts given as [piece, lower, upper]; the place does not matter to the counts. */
const bar = (parts: [string, number, number?][]): Bar => {
  const segments = parts.map(([piece, lower, upper]) => ({
    piece,
    lower,
    upper: upper ?? lower,
  })) as Bar["segments"];
  return {
    id: "x",
    place: { kind: "point", rank: 1, of: 1, scope: "" },
    lower: segments.reduce((t, s) => t + s.lower, 0),
    upper: segments.reduce((t, s) => t + s.upper, 0),
    segments,
  };
};

describe("the counts the sentences say", () => {
  it("counts school need as leading only when nothing else could reach it", () => {
    const leads = bar([
      ["permanent_classroom_deficit", 0.3],
      ["service_deficit", 0.2],
      ["A", 0.1],
      ["Q", 0, 0.05],
    ]);
    // Recorded, the other inputs add 0.25 against school need's 0.3; at the most the blank figure could add, 0.31.
    const couldMatch = bar([
      ["permanent_classroom_deficit", 0.3],
      ["A", 0.25],
      ["Q", 0, 0.06],
    ]);
    const level = bar([
      ["teacher_housing_deficit", 0.2],
      ["A", 0.2],
    ]);
    expect(needLeads([leads])).toBe(1);
    expect(needLeads([couldMatch])).toBe(0);
    expect(needLeads([level])).toBe(0);
    expect(needLeads([leads, couldMatch, level, leads])).toBe(2);
  });

  it("names every part that adds the most equally often, in the diagram's order", () => {
    const pieces = ["permanent_classroom_deficit", "teacher_housing_deficit", "A"] as const;
    const classrooms = bar([
      ["permanent_classroom_deficit", 0.3],
      ["teacher_housing_deficit", 0.1],
      ["A", 0.1],
    ]);
    const district = bar([
      ["permanent_classroom_deficit", 0.1],
      ["teacher_housing_deficit", 0.1],
      ["A", 0.2],
    ]);
    // Two parts level at the top: each counts once.
    const both = bar([
      ["permanent_classroom_deficit", 0.2],
      ["teacher_housing_deficit", 0.2],
      ["A", 0.1],
    ]);
    expect(largestParts([classrooms, classrooms, district], pieces)).toEqual({
      pieces: ["permanent_classroom_deficit"],
      count: 2,
    });
    expect(largestParts([district, classrooms], pieces)).toEqual({
      pieces: ["permanent_classroom_deficit", "A"],
      count: 1,
    });
    expect(largestParts([both], pieces)).toEqual({
      pieces: ["permanent_classroom_deficit", "teacher_housing_deficit"],
      count: 1,
    });
    // A blank figure is never the part that adds the most.
    expect(
      largestParts(
        [
          bar([
            ["A", 0],
            ["Q", 0, 0.05],
          ]),
        ],
        ["A", "Q"]
      )
    ).toBeNull();
  });

  it("the scale reaches the largest score, rounded up to a tenth, and no further than float noise", () => {
    expect(scaleOf([bar([["A", 0.7097]])])).toEqual({
      max: 0.8,
      ticks: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
    });
    expect(scaleOf([bar([["A", 0.7]])]).max).toBe(0.7);
    expect(scaleOf([bar([["A", 0.1 + 0.2]])]).max).toBe(0.3);
    // A range reaches its upper score.
    expect(
      scaleOf([
        bar([
          ["A", 0.55],
          ["Q", 0, 0.06],
        ]),
      ]).max
    ).toBe(0.7);
    expect(scaleOf([]).max).toBe(0.1);
  });
});
