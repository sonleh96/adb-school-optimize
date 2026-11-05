/**
 * The counts of each province (lib/explore/province.ts), read from the API's own saved responses. Failure modes, each
 * with the test that catches it:
 *  1. The counts do not add up to the totals the app shows elsewhere: the schools that can be put in order, the
 *     records not in the list yet and their two groups, under either main rule
 *                                                  -> "add up to the app's own totals ..."
 *  2. The precedence gives another split than the app's: a record with a missing detail and 0 classrooms counts as
 *     0 classrooms, or twice, or 0 teachers counts as 0 classrooms
 *                                                  -> "count a record to verify once, under the first reason ..."
 *  3. A record with no province is dropped, or split from the others with none
 *                                                  -> "give each province ... and the records with no province ..."
 *  4. A range school is counted twice, not at all, or in the top 20
 *                                                  -> "give each province ..." and "count a range school ..."
 *  5. The top 20 holds more or fewer than the first 20 ranks: ties, a list shorter than 20, a rank of another scope
 *                                                  -> "add up ..." and "count only a rank among the complete ..."
 *  6. One province shows as two rows because its name is spaced differently
 *                                                  -> "read a province as the screen shows it ..."
 *  7. A reader cannot find a province: the rows are in no order a name gives
 *                                                  -> "give each province ..."
 * The expected counts come from the dataset's definition in services/api/scripts/generate_screening_fixtures.py
 * (`provinces_records`), never from a run of the code.
 */
import { describe, expect, it } from "vitest";

import { type ProvinceCount, TOP, provinceCounts, totalOf, waiting } from "@/lib/explore/province";
import { bindCopy } from "@/lib/screening/copy";
import { parseWith } from "@/lib/screening/schema";
import { type ListedRow, inputsResponse, resultsResponse } from "@/lib/screening/types";

import { type Dataset, copy, readFixture } from "../screening/fixtures";

const list = (dataset: Dataset, rule: string) =>
  parseWith(resultsResponse, readFixture(`results/${rule}.json`, dataset), `${dataset}/${rule}`);
const rowsOf = (dataset: Dataset, rule = "additive_no_u") => list(dataset, rule).rows;
const named = (rows: readonly ListedRow[], name: string): ListedRow => {
  const row = rows.find((r) => r.school.source_school_name === name);
  if (!row) throw new Error(`No fixture row named ${name}`);
  return row;
};
const none = { missingField: 0, zeroClassrooms: 0, other: 0 };

describe("provinceCounts", () => {
  it("give each province its schools in the list, its top 20 and its records to verify, from A to Z, and the records with no province last", () => {
    // Per the dataset: 20 schools in the top 20 (8 North, 4 South, 5 East, 2 in the long-named province, 1 with no
    // province), 4 more complete schools little in need, a range school in North and one in the long-named province,
    // and eight records to verify.
    const expected: ProvinceCount[] = [
      {
        province: "Autonomous Region of the Far Eastern Isles",
        inList: 5,
        top20: 2,
        notYet: { ...none, zeroClassrooms: 1 },
      },
      { province: "East Province", inList: 5, top20: 5, notYet: { ...none, missingField: 1, other: 1 } },
      { province: "North Province", inList: 9, top20: 8, notYet: { ...none, missingField: 1 } },
      { province: "South Province", inList: 6, top20: 4, notYet: { ...none, zeroClassrooms: 1 } },
      { province: "West Province", inList: 0, top20: 0, notYet: { ...none, missingField: 1, other: 1 } },
      { province: null, inList: 1, top20: 1, notYet: { ...none, missingField: 1 } },
    ];
    expect(provinceCounts(rowsOf("provinces"))).toEqual(expected);
  });

  it("count a record to verify once, under the first reason that holds: a missing detail, then 0 classrooms, then any other", () => {
    const rows = rowsOf("provinces");
    const reasonOf = (row: ListedRow) => provinceCounts([row])[0].notYet;
    // The paper's rule: a missing core detail first, even when the record also gives 0 classrooms.
    expect(named(rows, "East Missing And Zero").gate_failures).toEqual(
      expect.arrayContaining(["missing_stock_field", "nonpositive_denominator"])
    );
    expect(reasonOf(named(rows, "East Missing And Zero"))).toEqual({ ...none, missingField: 1 });
    expect(reasonOf(named(rows, "South Zero Classrooms"))).toEqual({ ...none, zeroClassrooms: 1 });
    // 0 teachers is the same code from the engine, but the classrooms are fine: another reason, not 0 classrooms.
    expect(reasonOf(named(rows, "East Zero Teachers"))).toEqual({ ...none, other: 1 });
    expect(reasonOf(named(rows, "West Reach"))).toEqual({ ...none, other: 1 });
    // A negative count beside 0 classrooms is a value to check before the 0 can be read as one.
    const negative = copy(named(rows, "South Zero Classrooms"));
    negative.gate_failures.push("negative_stock_value");
    expect(reasonOf(negative)).toEqual({ ...none, other: 1 });
  });

  it("count a range school in the list and never in the top 20, even where its possible ranks reach it", () => {
    const rows = rowsOf("provinces");
    const range = named(rows, "North Range");
    expect(range.cohort).toBe("interval");
    expect(range.rank_bounds.best).toBeLessThanOrEqual(TOP);
    expect(provinceCounts([range])).toEqual([
      { province: "North Province", inList: 1, top20: 0, notYet: none },
    ]);
  });

  it("count only a rank among the complete schools as a rank in the top 20", () => {
    const first = copy(rowsOf("provinces").find((r) => r.cohort === "complete" && r.point_rank.rank === 1)!);
    expect(provinceCounts([first])[0].top20).toBe(1);
    first.point_rank.scope_code = "eligible";
    expect(provinceCounts([first])[0]).toMatchObject({ inList: 1, top20: 0 });
  });

  it("read a province as the screen shows it: spaced differently is the same province, blank is none", () => {
    const rows = rowsOf("provinces");
    const spaced = copy(named(rows, "North Top 01"));
    spaced.school.province = "  North   Province ";
    const blank = copy(named(rows, "South Top 01"));
    blank.school.province = "​ ";
    const counts = provinceCounts([
      named(rows, "North Top 02"),
      spaced,
      blank,
      named(rows, "Nowhere Top 01"),
    ]);
    expect(counts.map((c) => [c.province, c.inList])).toEqual([
      ["North Province", 2],
      [null, 2],
    ]);
  });

  describe.each(["additive_no_u", "additive_u"] as const)("under %s", (rule) => {
    it.each(["", "worst-names", "ties-and-ranges", "one", "provinces"] as const)(
      "add up to the app's own totals in dataset %j: the list, the top 20, the records to verify and their groups",
      (dataset) => {
        const results = list(dataset, rule);
        const inputs = parseWith(inputsResponse, readFixture("inputs.json", dataset), "inputs");
        const { counts } = bindCopy({ view: rule, inputs, lists: [results] }).copy;
        const total = totalOf(provinceCounts(results.rows));
        expect(total.inList).toBe(counts.ranked);
        expect(waiting(total.notYet)).toBe(counts.queue);
        expect(total.notYet.missingField).toBe(counts.queueMissing);
        expect(total.notYet.zeroClassrooms).toBe(counts.queueZero);
        // Ranks are never shared (the name breaks a tie), so the top 20 is 20 schools, or every complete one.
        expect(total.top20).toBe(Math.min(TOP, Number(counts.complete)));
      }
    );
  });
});
