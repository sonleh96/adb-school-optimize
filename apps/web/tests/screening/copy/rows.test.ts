/**
 * The words of a list row: its figure, and the headings of the incomplete-records list.
 *
 * Failure modes, each with the test that catches it:
 *  1. A range row sits beside a bare place that counts a different group, so "5th" and "5th to 6th" read as one
 *     scale (R19). A range carries its group when, and only when, the list also shows single places.
 *  2. The group a range counts comes from the wrong rule's run, or is invented when the data does not give it.
 *  3. A blank province becomes an empty heading, or one made of spaces or zero-width characters.
 *  4. A school missing several details is filed under one of them, or under a count of zero or one.
 */
import { describe, expect, it } from "vitest";

import { copyFor, provinceHeading, rowPlace } from "@/lib/screening/copy";

import { school, textProblems } from "./helpers";

const complete = [school({ id: "a", place: 1 }), school({ id: "b", place: 2 })];
const range = school({ id: "r", cohort: "interval", bounds: [3, 4], blank: ["aqi"] });
const exact = school({ id: "x", cohort: "interval", bounds: [5, 5], blank: ["aqi"] });
const counts = { all: 12, complete: 8, range: 2, ranked: 10, queue: 2 };

describe("a list row's figure", () => {
  const P = copyFor({ schools: [...complete, range, exact], counts, countsByRule: "shared" });

  it("adds the group a range counts when the list shows single places and ranges together", () => {
    expect(P.scopesMix()).toBe(true);
    expect(P.rowPlace(range, "additive_u")).toBe("3rd to 4th of 10");
    expect(P.rowPlace(exact, "additive_u")).toBe("5th of 10");
    expect(P.rowPlace(complete[0], "additive_u")).toBe("1st");
    expect(textProblems(P.rowPlace(range, "additive_u"), { sentence: false })).toEqual([]);
  });

  it("leaves the range as the card writes it when the list holds no single place", () => {
    const only = [range, exact];
    expect(P.scopesMix(only)).toBe(false);
    expect(P.rowPlace(range, "additive_u", only)).toBe(P.placeHeadline(range, "additive_u"));
    expect(P.rowPlace(range, "additive_u", only)).toBe("3rd to 4th");
  });

  it("does not count a list of single places and incomplete records as mixed", () => {
    const held = school({ id: "q", cohort: "queue", gate: ["service_deficit"] });
    expect(P.scopesMix([...complete, held])).toBe(false);
  });

  it("names no group the data does not give", () => {
    expect(rowPlace(range, "additive_u", [...complete, range])).toBe("3rd to 4th of all in order");
  });

  it("uses the group of the rule the row is shown under", () => {
    const Q = copyFor({
      schools: [...complete, range],
      counts,
      countsByRule: { additive_u: { complete: 8, ranked: 10 }, need_first_u: { complete: 9, ranked: 11 } },
    });
    expect(Q.rowPlace(range, "additive_u")).toBe("3rd to 4th of 10");
    expect(Q.rowPlace(range, "need_first_u")).toBe("3rd to 4th of 11");
  });

  it("does not turn a school with no result into a range", () => {
    const none = { ...range, results: {} };
    expect(P.rowPlace(none, "additive_u")).toBe("No result");
  });
});

describe("the heading of a province group", () => {
  it("is the province, cleaned, and a plain phrase when it is blank", () => {
    expect(provinceHeading("  Highlands ")).toBe("Highlands");
    for (const blank of [null, undefined, "", "   ", "​", " ​  "])
      expect(provinceHeading(blank), JSON.stringify(blank)).toBe("Province not recorded");
    expect(copyFor().provinceHeading(null)).toBe("Province not recorded");
  });
});

describe("the heading of a group by what is missing", () => {
  const P = copyFor();

  it("is the one cause when there is one", () => {
    const one = school({ id: "q1", cohort: "queue", gate: ["service_deficit"] });
    expect(P.missingLabels(one)).toHaveLength(1);
    expect(P.missingGroupLabel(one)).toBe(P.missingLabels(one)[0]);
  });

  it("is a count of the kinds of detail when several are missing", () => {
    const many = school({ id: "q2", cohort: "queue", gate: ["service_deficit", "teacher_housing_deficit"] });
    expect(P.missingLabels(many).length).toBeGreaterThan(1);
    expect(P.missingGroupLabel(many)).toBe(`${P.missingLabels(many).length} kinds of detail missing`);
  });

  it("refuses a school that is not incomplete, which has no such group", () => {
    expect(() => P.missingGroupLabel(school({ id: "c" }))).toThrow(/only an incomplete record/);
  });
});

describe("the words of a load in progress", () => {
  it("name what is loading, in the words the rest of the screen uses", () => {
    const { LAYOUT } = copyFor();
    expect(LAYOUT.loading).toBe("Loading the schools");
    expect(LAYOUT.mapLoading).toBe("Loading the map");
    expect(LAYOUT.productName).toBe("RISE-PNG");
    for (const t of [LAYOUT.loading, LAYOUT.mapLoading, LAYOUT.provinceNotRecorded])
      expect(textProblems(t, { sentence: false }), t).toEqual([]);
  });
});
