/**
 * Which column of a part's chart each school of the list falls in (lib/explore/parts.ts). Failure modes, each with
 * the test that catches it:
 *  1. A share at a step's edge lands in the wrong column: none drawn in the first quarter, exactly a quarter drawn
 *     under it, or a whole share drawn as just under it    -> "puts a share at each edge in the step it starts"
 *  2. A figure the record does not give is drawn as a zero  -> "never draws a figure the record does not give ..."
 *  3. A school the rule does not put in order is drawn or counted
 *                                                          -> "holds only the schools the rule puts in order"
 *  4. A remoteness category written in another case reads as unknown, or an unknown one as highly accessible
 *                                                          -> "reads the recorded remoteness category ..."
 *  5. Two equal power-and-water scores split into two columns because of how the engine rounds
 *                                                          -> "gives power and water one column per score ..."
 *  6. The sentence over a chart names a column other than the tallest, or a school is found in the wrong column
 *                                                          -> "finds the tallest column and each school's column"
 *  7. A label sits under another column than its own, so a column reads as another record, or a share's quarter line
 *     sits inside a column                                 -> "puts each label under its own column ..."
 *  8. Lifting the marked school to the top of its column moves it, or any other school, to another column, or loses
 *     one                                                  -> "lifts the marked school to the top of its own column ..."
 */
import { describe, expect, it } from "vitest";

import { PART_KEYS, columnOf, partColumns, raised, tallest, ticksOf } from "@/lib/explore/parts";
import type { CopySchool } from "@/lib/screening/copy/model";

import { school } from "../screening/copy/helpers";

const RULE = "additive_no_u";
const withClassrooms = (id: string, permanent: number | null, total: number | null) =>
  school({ id, condition: { classrooms_permanent: permanent, classrooms_total: total } });
const withHousing = (id: string, houses: number | null, teachers: number | null) =>
  school({ id, condition: { teacher_houses: houses, teachers } });
const withNeed = (id: string, parts: Partial<NonNullable<CopySchool["need_parts"]>>): CopySchool => {
  const base = school({ id });
  return { ...base, need_parts: { ...base.need_parts!, ...parts } };
};
const keysIn = (columns: readonly (readonly CopySchool[])[]) => columns.map((c) => c.map((s) => s.id));

describe("partColumns", () => {
  it("puts a share at each edge in the step it starts: none only at 0, a quarter from its own start, all only at 1", () => {
    const schools = [
      withClassrooms("none", 0, 8),
      withClassrooms("one-in-200", 1, 200),
      withClassrooms("eighth", 1, 8),
      withClassrooms("quarter", 2, 8),
      withClassrooms("third", 1, 3),
      withClassrooms("half", 4, 8),
      withClassrooms("two-thirds", 2, 3),
      withClassrooms("three-quarters", 6, 8),
      withClassrooms("seven-eighths", 7, 8),
      withClassrooms("199-in-200", 199, 200),
      withClassrooms("all", 8, 8),
      withClassrooms("more-than-all", 9, 8),
    ];
    expect(keysIn(partColumns("classrooms", schools, RULE).columns)).toEqual([
      ["none"],
      ["one-in-200", "eighth"],
      ["quarter", "third"],
      ["half", "two-thirds"],
      ["three-quarters", "seven-eighths", "199-in-200"],
      ["all", "more-than-all"],
    ]);
    // Teacher houses count up to one per teacher, so every school with at least one per teacher shares the last step.
    const housing = [
      withHousing("no-houses", 0, 5),
      withHousing("one-in-five", 1, 5),
      withHousing("three-in-four", 3, 4),
      withHousing("one-each", 5, 5),
      withHousing("more-than-one-each", 7, 5),
    ];
    expect(keysIn(partColumns("housing", housing, RULE).columns)).toEqual([
      ["no-houses"],
      ["one-in-five"],
      [],
      [],
      ["three-in-four"],
      ["one-each", "more-than-one-each"],
    ]);
  });

  it("never draws a figure the record does not give: no column holds it, and the list still counts it", () => {
    const schools = [
      withClassrooms("recorded", 0, 8),
      withClassrooms("no-total", 2, null),
      withClassrooms("no-permanent", null, 8),
      withClassrooms("zero-total", 0, 0),
      school({ id: "blank-library", condition: { libraries: null } }),
    ];
    const classrooms = partColumns("classrooms", schools, RULE);
    // The school with a blank library count records 2 of 8 classrooms as permanent, a quarter.
    expect(keysIn(classrooms.columns)).toEqual([["recorded"], [], ["blank-library"], [], [], []]);
    expect(classrooms.unrecorded.map((s) => s.id)).toEqual(["no-total", "no-permanent", "zero-total"]);
    expect(classrooms.total).toBe(5);

    const facilities = partColumns("facilities", schools, RULE);
    expect(facilities.unrecorded.map((s) => s.id)).toEqual(["blank-library"]);
    expect(facilities.columns[0]).toEqual([]);
  });

  it("holds only the schools the rule puts in order, those with one rank or a range", () => {
    const schools = [
      school({ id: "ranked" }),
      school({ id: "range", cohort: "interval", bounds: [3, 9] }),
      school({ id: "queued", cohort: "queue" }),
    ];
    for (const key of PART_KEYS) {
      const chart = partColumns(key, schools, RULE);
      expect(chart.total, key).toBe(2);
      expect(
        chart.columns
          .flat()
          .map((s) => s.id)
          .sort(),
        key
      ).toEqual(["range", "ranked"]);
    }
  });

  it("reads the recorded remoteness category in any case and spacing, and never reads an unknown one as a step", () => {
    const schools = [
      school({ id: "spaced", locality: "  Very Remote " }),
      school({ id: "lower", locality: "highly accessible" }),
      school({ id: "unknown", locality: "Island" }),
      school({ id: "blank", locality: null }),
    ];
    const chart = partColumns("locality", schools, RULE);
    expect(chart.steps).toHaveLength(6);
    expect(keysIn(chart.columns)).toEqual([["lower"], [], [], [], ["spaced"], []]);
    expect(chart.unrecorded.map((s) => s.id)).toEqual(["unknown", "blank"]);
  });

  it("gives power and water one column per score the list holds, lowest first, however the engine rounded it", () => {
    const schools = [
      withNeed("generator-piped", { service_deficit: 0.44999999999999996 }),
      withNeed("solar-tank", { service_deficit: 0.45 }),
      withNeed("grid-piped", { service_deficit: 0.2 }),
      withNeed("generator-river", { service_deficit: 0.85 }),
      withNeed("blank", { service_deficit: null }),
    ];
    const chart = partColumns("services", schools, RULE);
    expect(chart.steps).toEqual([
      { kind: "points", points: 4 },
      { kind: "points", points: 9 },
      { kind: "points", points: 17 },
    ]);
    expect(keysIn(chart.columns)).toEqual([
      ["grid-piped"],
      ["generator-piped", "solar-tank"],
      ["generator-river"],
    ]);
    expect(chart.unrecorded.map((s) => s.id)).toEqual(["blank"]);
  });

  it("finds the tallest column, the first of the tallest, and the column holding each school", () => {
    const schools = [
      school({ id: "a", condition: { libraries: 1, workshops: 1 } }),
      school({ id: "b", condition: { libraries: 0, specialized_classrooms: 0 } }),
      school({ id: "c", condition: { libraries: 0, specialized_classrooms: 0 } }),
      school({ id: "d", condition: { libraries: 1, workshops: 1 } }),
    ];
    const chart = partColumns("facilities", schools, RULE);
    // Two schools with no facility type, two with three: the first of the tallest is the one nearer the start.
    expect(chart.columns[0].map((s) => s.id)).toEqual(["b", "c"]);
    expect(chart.columns[3].map((s) => s.id)).toEqual(["a", "d"]);
    expect(tallest(chart)).toBe(0);
    expect(columnOf(chart, "d")).toBe(3);
    expect(columnOf(chart, "nobody")).toBeNull();
    expect(tallest(partColumns("facilities", [], RULE))).toBeNull();
  });

  it("puts each label under its own column, and a share's quarter lines on the edges between columns", () => {
    const share = ticksOf(partColumns("classrooms", [school({ id: "a" })], RULE));
    expect(share).toEqual([
      { kind: "step", at: 1 / 12, step: 0, room: 1 / 6 },
      { kind: "edge", at: 2 / 6, quarter: 1 },
      { kind: "edge", at: 3 / 6, quarter: 2 },
      { kind: "edge", at: 4 / 6, quarter: 3 },
      { kind: "step", at: 11 / 12, step: 5, room: 1 / 6 },
    ]);
    const facilities = ticksOf(partColumns("facilities", [school({ id: "a" })], RULE));
    expect(facilities.map((tick) => (tick.kind === "step" ? tick.step : null))).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    facilities.forEach((tick, step) => expect(tick.at).toBeCloseTo((step + 0.5) / 7, 12));
  });

  it("lifts the marked school to the top of its own column, and moves no school to another", () => {
    const chart = partColumns(
      "facilities",
      ["a", "b", "c", "d", "e"].map((id) => school({ id })),
      RULE
    );
    // Every default record has two facility types, so all five share the column of two.
    expect(keysIn(raised(chart.columns, "b"))[2]).toEqual(["a", "c", "d", "e", "b"]);
    expect(keysIn(raised(chart.columns, "e"))).toEqual(keysIn(chart.columns));
    expect(keysIn(raised(chart.columns, null))).toEqual(keysIn(chart.columns));
    expect(keysIn(raised(chart.columns, "nobody"))).toEqual(keysIn(chart.columns));
  });
});
