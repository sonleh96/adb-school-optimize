/**
 * Sentences about one school: its place, its reasons, its missing details, its name and its ties.
 *
 * Failure modes, each with the test that catches it:
 *  1. The place sentence states the wrong place, or a place for a school that has none. Each cohort and each way
 *     the bounds can relate to the place has its own case, with the expected sentence written out.
 *  2. A range school's headline reads as a single place beside another school's place.
 *  3. The plain card offers a second place, or the method card forgets the one it should add.
 *  4. A blank name, district or province leaks "null" or leaves an empty clause.
 *  5. A missing reading reads as a value ("lists no emission sources", "reaches 0"). Every combination of the
 *     three readings missing is checked.
 *  6. Two schools level on score or on school need get no tie note, or a school that is not level gets one.
 *  7. Two schools whose names differ only in spacing read the same.
 *  8. An input sentence takes the wrong branch for a blank, a zero or an unlisted value. Each branch is a case.
 *  9. A missing-detail note, chip or sentence disagrees with the raw cause (blank against recorded as 0). The
 *     cause is recomputed here from the raw fields, apart from the copy.
 * 10. The drivers named in a reason are not the inputs that add most to the engine's own score.
 */
import { describe, expect, it } from "vitest";

import * as copy from "@/lib/screening/copy";
import { countsFromResults, copyFor, schoolFromDetail } from "@/lib/screening/copy";
import type { CopyRuleId, CopySchool, InputKey } from "@/lib/screening/copy";

import { Corpus, KEYS, RULES, fixtureDetail, fixtureResults, school, textProblems } from "./helpers";

const COUNTS = { all: 25, complete: 16, range: 5, ranked: 21, queue: 4 };
const P = copyFor({ counts: COUNTS });

describe("the place sentence", () => {
  const rank = (s: CopySchool, rule: CopyRuleId = "additive_u", opts = {}) => P.rankSentence(s, rule, opts);

  it("names a complete school's place among the schools with every input recorded", () => {
    expect(rank(school({ id: "a", place: 3 }))).toBe("3rd of the 16 schools with every input recorded.");
    expect(rank(school({ id: "a", place: 12 }), "additive_u", { name: true })).toBe(
      "School a is 12th of the 16 schools with every input recorded."
    );
  });

  it("adds the place among all the schools that can be put in order only when counting the range schools moves it", () => {
    expect(rank(school({ id: "a", place: 5, bounds: [5, 5] }))).toBe(
      "5th of the 16 schools with every input recorded."
    );
    expect(rank(school({ id: "a", place: 5, bounds: [7, 7] }))).toBe(
      "5th of the 16 schools with every input recorded, and 7th once the five schools that show a range are counted."
    );
    expect(rank(school({ id: "a", place: 5, bounds: [5, 6] }))).toBe(
      "5th of the 16 schools with every input recorded, and 5th or 6th once the five schools that show a range are counted."
    );
    expect(rank(school({ id: "a", place: 5, bounds: [5, 9] }))).toBe(
      "5th of the 16 schools with every input recorded, and anywhere from 5th to 9th once the five schools that show a range are counted."
    );
  });

  it("states a range school's highest and lowest places and which reading is missing", () => {
    const s = school({ id: "r", cohort: "interval", bounds: [12, 24], blank: ["aqi"] });
    expect(rank(s)).toBe(
      "Anywhere from 12th to 24th of the 21 schools that can be put in order. Its air-quality reading, an air-pollution index for its location, is missing, so the screen shows the highest and lowest places in the list it could take."
    );
    expect(rank(s, "additive_u", { name: true, shortlist: 20 })).toBe(
      "School r could be anywhere from 12th to 24th of the 21 schools that can be put in order. Its air-quality reading, an air-pollution index for its location, is missing, so the screen shows the highest and lowest places in the list it could take. It may or may not be in the top 20, depending on the missing reading."
    );
  });

  it("says a range school whose ends are equal has one place, and why that cannot change", () => {
    const s = school({ id: "r", cohort: "interval", bounds: [21, 21], blank: ["aqi"] });
    expect(rank(s, "additive_u", { shortlist: 20 })).toBe(
      "21st of the 21 schools that can be put in order. Its air-quality reading is missing, but under this rule that cannot change its place in the list. It is outside the top 20 either way."
    );
    expect(
      rank(school({ id: "r", cohort: "interval", bounds: [3, 3], blank: ["aqi"] }), "additive_u", {
        shortlist: 20,
      })
    ).toContain("It is in the top 20 either way.");
  });

  it("says a school with an incomplete record cannot be put in order yet, whatever the rule", () => {
    const q = school({ id: "q", cohort: "queue", gate: ["teacher_housing_deficit"] });
    for (const rule of RULES) {
      expect(rank(q, rule)).toBe(
        "Cannot be put in order yet. Its record is incomplete, so it has no place in the list until the missing details are checked. That says nothing about its need."
      );
    }
    expect(rank(q, "additive_u", { name: true })).toMatch(/^School q cannot be put in order yet\./);
  });

  it("says a school has no result under a rule that holds none for it, and claims nothing about why", () => {
    const s = { ...school({ id: "a", place: 2 }), results: { additive_no_u: { rank_complete120: 2 } } };
    expect(rank(s, "benchmark")).toBe("No result under the conventional benchmark (B).");
    const r = { ...school({ id: "r", cohort: "interval", bounds: [3, 4], blank: ["aqi"] }), results: {} };
    expect(rank(r, "benchmark")).toBe("No result under the conventional benchmark (B).");
    expect(rank(r, "benchmark", { name: true })).toBe(
      "School r has no result under the conventional benchmark (B)."
    );
  });

  it("states no count it was not given", () => {
    const s = school({ id: "a", place: 3, bounds: [5, 5] });
    expect(copy.rankSentence(s, "additive_u")).toBe(
      "3rd of the schools with every input recorded, and 5th once the schools that show a range are counted."
    );
  });
});

describe("the card's figure and its context", () => {
  it("is a bare place for a complete school, and always a range or a scope for a range school", () => {
    expect(P.placeHeadline(school({ id: "a", place: 3 }), "additive_u")).toBe("3rd");
    expect(P.placeHeadline(school({ id: "r", cohort: "interval", bounds: [12, 18] }), "additive_u")).toBe(
      "12th to 18th"
    );
    expect(P.placeHeadline(school({ id: "r", cohort: "interval", bounds: [5, 5] }), "additive_u")).toBe(
      "5th of 21"
    );
    expect(copy.placeHeadline(school({ id: "r", cohort: "interval", bounds: [5, 5] }), "additive_u")).toBe(
      "5th of all in order"
    );
    expect(P.placeHeadline(school({ id: "q", cohort: "queue" }), "additive_u")).toBe(
      "Cannot be put in order yet"
    );
    expect(P.placeHeadline({ ...school({ id: "a" }), results: {} }, "benchmark")).toBe("No result");
  });

  it("never restates the place, and offers a second one only in method details", () => {
    const s = school({ id: "a", place: 5, bounds: [7, 9] });
    expect(P.placeContext(s, "additive_u")).toBe("Among the 16 schools with every input recorded.");
    expect(P.placeContext(s, "additive_u", { method: true })).toBe(
      "Among the 16 schools with every input recorded. Counting the five schools that show a range, it could be anywhere from 7th to 9th."
    );
    expect(
      P.placeContext(school({ id: "a", place: 5, bounds: [5, 5] }), "additive_u", { method: true })
    ).toBe("Among the 16 schools with every input recorded.");
    expect(
      P.placeContext(school({ id: "a", place: 5, bounds: [7, 7] }), "additive_u", { method: true })
    ).toContain("it would be 7th.");
  });

  it("says a range school's context and the top-list clause", () => {
    const s = school({ id: "r", cohort: "interval", bounds: [30, 40], blank: ["emissions", "land"] });
    expect(P.placeContext(s, "additive_u", { shortlist: 20 })).toBe(
      "Possible places among the 21 schools that can be put in order. Its nearby emissions figure and land-cover figure are not recorded, so the screen shows the highest and lowest places in the list it could take. It is outside the top 20 either way."
    );
  });

  it("says what a complete school's place is among all the schools, or that the rule did not count them", () => {
    expect(P.fullRankingSentence(school({ id: "a", place: 5, bounds: [5, 5] }), "additive_u")).toBe(
      "Counting the five schools that show a range does not change its place in the list."
    );
    expect(P.fullRankingSentence(school({ id: "a", place: 5, bounds: [7, 9] }), "additive_u")).toBe(
      "Once the five schools that show a range are counted, it would sit between 7th and 9th of all 21 schools that can be put in order."
    );
    expect(
      P.fullRankingSentence(
        { ...school({ id: "a", place: 5 }), results: { additive_u: { rank_complete120: 5 } } },
        "additive_u"
      )
    ).toBe(
      "This rule was not run on all 21 schools that can be put in order, so only its place in the list among the 16 schools with every input recorded is available."
    );
  });
});

describe("one school under two rules", () => {
  it("reads a single place under each rule for a complete school", () => {
    const a = {
      ...school({ id: "a", place: 3 }),
      results: { additive_u: { rank_complete120: 3 }, additive_no_u: { rank_complete120: 4 } },
    };
    expect(P.rangeComparisonSentence(a, "additive_u", "additive_no_u")).toBe(
      "Among the 16 schools with every input recorded, School a is 3rd under the combined-factors rule with urgency (S) and 4th under the combined-factors rule without urgency (S0)."
    );
  });

  it("reads each rule's range for a range school, and names a rule that did not compute it", () => {
    const r = school({ id: "r", cohort: "interval", bounds: [12, 18] });
    const both = {
      ...r,
      results: {
        additive_u: { rank_best: 12, rank_worst: 18 },
        additive_no_u: { rank_best: 18, rank_worst: 30 },
      },
    };
    expect(P.rangeComparisonSentence(both, "additive_u", "additive_no_u")).toBe(
      "Among the 21 schools that can be put in order, School r sits anywhere from 12th to 18th under the combined-factors rule with urgency (S), and anywhere from 18th to 30th under the combined-factors rule without urgency (S0)."
    );
    const one = { ...r, results: { additive_u: { rank_best: 4, rank_worst: 4 } } };
    expect(P.rangeComparisonSentence(one, "additive_u", "benchmark")).toBe(
      "Among the 21 schools that can be put in order, School r sits 4th under the combined-factors rule with urgency (S). It has no result under the conventional benchmark (B)."
    );
    expect(P.rangeComparisonSentence({ ...r, results: {} }, "additive_u", "benchmark")).toBe(
      "School r has no result under the combined-factors rule with urgency (S) or the conventional benchmark (B)."
    );
  });

  it("says a school with an incomplete record has no place under either rule when it has no result under both", () => {
    expect(P.rangeComparisonSentence(school({ id: "q", cohort: "queue" }), "additive_u", "benchmark")).toBe(
      "School q cannot be put in order under the combined-factors rule with urgency (S) or the conventional benchmark (B) yet, because its record is incomplete."
    );
  });

  it("gives a place under the rule that has one for a school held back under the other", () => {
    const q = { ...school({ id: "q", cohort: "queue" }), results: { benchmark: { rank_complete120: 7 } } };
    expect(P.rangeComparisonSentence(q, "additive_u", "benchmark")).toBe(
      "Under the conventional benchmark (B), School q is 7th among the 16 schools with every input the rule reads recorded. It cannot be put in order under the combined-factors rule with urgency (S) yet, because its record is incomplete."
    );
  });
});

describe("one school that shows a range", () => {
  const one = copy.copyFor({ counts: { complete: 9, range: 1, ranked: 10 } });
  const four = copy.copyFor({ counts: { complete: 9, range: 4, ranked: 13 } });

  it("agrees the subject, the verb and the pronouns in the list order", () => {
    expect(one.scope("additive_u").listOrder).toBe(
      "The one school that shows a range is listed where it would sit if its missing readings added nothing to its screening score. The study uses this as its main order."
    );
    expect(one.scope("additive_u").listOrderUpper).toBe(
      "Sensitivity check: the one school that shows a range is listed where it would sit if its missing readings added as much as they can to its screening score."
    );
    expect(one.termsFor("additive_u").list_order.line).toBe(
      "In the list, the one school that shows a range sits where it would if its missing readings added nothing to its screening score."
    );
    expect(four.scope("additive_u").listOrder).toBe(
      "The four schools that show a range are listed where they would sit if their missing readings added nothing to their screening score. The study uses this as its main order."
    );
    expect(four.termsFor("additive_u").list_order.line).toBe(
      "In the list, the four schools that show a range sit where they would if their missing readings added nothing to their screening score."
    );
  });

  it("agrees the verb where the range schools are counted", () => {
    const s = {
      ...school({ id: "c", place: 5 }),
      results: {
        additive_u: { rank_complete120: 5, rank_best: 5, rank_worst: 6, rank_bounds_scope: "eligible124" },
      },
    };
    expect(one.rankSentence(s, "additive_u")).toBe(
      "5th of the 9 schools with every input recorded, and 5th or 6th once the one school that shows a range is counted."
    );
    expect(one.fullRankingSentence(s, "additive_u")).toBe(
      "Once the one school that shows a range is counted, it would sit between 5th and 6th of all 10 schools that can be put in order."
    );
    expect(four.rankSentence(s, "additive_u")).toContain(
      "once the four schools that show a range are counted."
    );
  });

  it("agrees the pronoun in the reassurance about leaving urgency out", () => {
    const rows = [
      {
        left_rule: "additive_u",
        right_rule: "additive_no_u",
        n: 9,
        top10_overlap: 9,
        top20_overlap: 9,
        top30_overlap: 9,
        top40_overlap: 9,
        median_absolute_rank_shift: 1,
        maximum_absolute_rank_shift: 2,
      },
    ];
    const range = (id: string) => school({ id, cohort: "interval", bounds: [3, 4] });
    const complete = (id: string) => school({ id, place: 1 });
    const text = (schools: copy.CopySchool[]) => copy.urgencyReassurance({ pairwise: rows, schools });
    expect(text([complete("a"), range("r")])).toMatch(
      /For the one school that shows a range, leaving it out can still move its possible places\.$/
    );
    expect(text([complete("a"), range("r"), range("q")])).toMatch(
      /For the two schools that show a range, leaving it out can still move their possible places\.$/
    );
  });
});

describe("one school under two rules, whatever its group under each", () => {
  const complete = (
    id: string,
    results: copy.PlacedSchool["results"],
    cohort: copy.CopyCohort = "complete"
  ) => ({
    ...school({ id, cohort }),
    results,
  });
  const S = "the combined-factors rule with urgency (S)";
  const S0 = "the combined-factors rule without urgency (S0)";
  const B = "the conventional benchmark (B)";

  it("gives a complete school's place under one rule and says the other has no result, instead of throwing", () => {
    const a = complete("a", { additive_u: { rank_complete120: 3 } });
    expect(P.rangeComparisonSentence(a, "additive_u", "additive_no_u")).toBe(
      `Under ${S}, School a is 3rd among the 16 schools with every input recorded. It has no result under ${S0}.`
    );
    expect(P.rangeComparisonSentence(a, "additive_no_u", "additive_u")).toBe(
      `Under ${S}, School a is 3rd among the 16 schools with every input recorded. It has no result under ${S0}.`
    );
  });

  it("gives a complete school's place under one rule and its range under the other", () => {
    const a = complete("a", {
      additive_u: { rank_complete120: 3 },
      additive_no_u: { rank_best: 3, rank_worst: 5, rank_bounds_scope: "eligible124" },
    });
    expect(P.rangeComparisonSentence(a, "additive_u", "additive_no_u")).toBe(
      `Under ${S}, School a is 3rd among the 16 schools with every input recorded. Under ${S0}, it could be anywhere from 3rd to 5th among the 21 schools that can be put in order.`
    );
  });

  it("gives a range school's single place under a rule that does not read the missing reading", () => {
    const r = complete(
      "r",
      {
        additive_u: { rank_best: 12, rank_worst: 18 },
        benchmark: { rank_complete120: 9 },
      },
      "interval"
    );
    expect(P.rangeComparisonSentence(r, "additive_u", "benchmark")).toBe(
      `Under ${S}, School r could be anywhere from 12th to 18th among the 21 schools that can be put in order. Under ${B}, it is 9th among the 16 schools with every input the rule reads recorded.`
    );
  });

  it("answers for every pair of cohorts, with a result or none, and never throws", () => {
    const standings = [
      undefined,
      { rank_complete120: 4 },
      { rank_best: 4, rank_worst: 4 },
      { rank_best: 4, rank_worst: 9 },
    ];
    for (const cohort of ["complete", "interval", "queue"] as const)
      for (const a of standings)
        for (const b of standings) {
          const results = { ...(a ? { additive_u: a } : {}), ...(b ? { benchmark: b } : {}) };
          const text = P.rangeComparisonSentence(complete("x", results, cohort), "additive_u", "benchmark");
          expect(textProblems(text), text).toEqual([]);
          expect(text).toContain("School x");
        }
  });

  it("names a different group for each rule when their groups differ, and one group when they do not", () => {
    const a = complete("a", { additive_u: { rank_complete120: 3 }, additive_no_u: { rank_complete120: 5 } });
    const same = copy.copyFor({ counts: { complete: 16, range: 5, ranked: 21 } });
    expect(same.rangeComparisonSentence(a, "additive_u", "additive_no_u")).toBe(
      `Among the 16 schools with every input recorded, School a is 3rd under ${S} and 5th under ${S0}.`
    );
    const differ = copy.copyFor({
      counts: { complete: 16, range: 5, ranked: 21 },
      countsByRule: {
        additive_u: { complete: 16, range: 5, ranked: 21 },
        additive_no_u: { complete: 17, range: 5, ranked: 22 },
      },
    });
    expect(differ.rangeComparisonSentence(a, "additive_u", "additive_no_u")).toBe(
      `Under ${S}, School a is 3rd among the 16 schools with every input recorded. Under ${S0}, it is 5th among the 17 schools with every input the rule reads recorded.`
    );
    const equal = copy.copyFor({
      counts: { complete: 16, range: 5, ranked: 21 },
      countsByRule: { additive_u: { complete: 16, ranked: 21 }, additive_no_u: { complete: 16, ranked: 21 } },
    });
    expect(equal.rangeComparisonSentence(a, "additive_u", "additive_no_u")).toBe(
      same.rangeComparisonSentence(a, "additive_u", "additive_no_u")
    );
  });
});

describe("a school's name and where it is", () => {
  it("reads a blank or missing name as Unnamed school", () => {
    for (const name of [null, "", "   ", " \t "]) expect(copy.displayName({ name })).toBe("Unnamed school");
    expect(copy.displayName({ name: "  Alder   Junior High  School " })).toBe("Alder Junior High School");
  });

  it("reads a name made only of zero-width characters as blank, because that is how a blank name arrives", () => {
    // U+200B to U+200D, U+2060 and U+FEFF show nothing, and the engine refuses a name that is truly empty.
    for (const name of ["\u200B", "\u200B\u200C\u200D\u2060\uFEFF", " \u200B ", "\u2060"])
      expect(copy.displayName({ name }), JSON.stringify(name)).toBe("Unnamed school");
    // A name with letters keeps them, and keeps a zero-width character that sits among them.
    expect(copy.displayName({ name: "\u200BAlder" })).toBe("\u200BAlder");
    expect(copy.displayName({ name: "Al\u200Bder" })).toBe("Al\u200Bder");
  });

  it("shows the record id for two schools whose names are blank in different ways", () => {
    const a = school({ id: "z1", name: "\u200B" });
    const b = school({ id: "z2", name: "" });
    const c = school({ id: "z3", name: "   " });
    const list = [a, b, c];
    expect(list.map((x) => copy.distinctName(x, list))).toEqual([
      "Unnamed school (record z1)",
      "Unnamed school (record z2)",
      "Unnamed school (record z3)",
    ]);
    expect(P.rankSentence(a, "additive_u", { name: true })).toMatch(/^Unnamed school is /);
  });

  it("reads a district, province or remoteness made only of zero-width characters as blank", () => {
    expect(copy.locationLine({ id: "x", name: "x", district: "\u200B", province: "Western" })).toBe(
      "District not recorded, Western"
    );
    expect(copy.locationLine({ id: "x", name: "x", district: "Middle Fly", province: "\uFEFF\u200B" })).toBe(
      "Middle Fly, province not recorded"
    );
    const s = school({ id: "z", locality: "\u200B" });
    expect(copy.inputSentence(s, "locality")).toBe("Its remoteness category is not recorded.");
  });

  it("says where a school is in words when the district or province is blank", () => {
    const loc = (district: string | null, province: string | null) =>
      copy.locationLine({ id: "x", name: "x", district, province });
    expect(loc("Middle Fly", "Western")).toBe("Middle Fly, Western");
    expect(loc("  Middle   Fly ", "Western")).toBe("Middle Fly, Western");
    expect(loc(null, "Western")).toBe("District not recorded, Western");
    expect(loc("", "Western")).toBe("District not recorded, Western");
    expect(loc("Middle Fly", null)).toBe("Middle Fly, province not recorded");
    expect(loc("Middle Fly", "  ")).toBe("Middle Fly, province not recorded");
    expect(loc(null, null)).toBe("Location not recorded");
  });

  it("tells apart two schools whose names differ only in spacing", () => {
    const a = school({ id: "s1", name: "Lumi ", district: "North" });
    const b = school({ id: "s2", name: "Lumi", district: "South" });
    const c = school({ id: "s3", name: "Lumi  ", district: "South" });
    const loner = school({ id: "s4", name: "Kwikila" });
    const list = [a, b, c, loner];
    expect(copy.distinctName(a, [a, b])).toBe("Lumi (North)");
    expect(copy.distinctName(b, [a, b])).toBe("Lumi (South)");
    // b and c share name and district, so only the record can tell them apart.
    expect(copy.distinctName(b, list)).toBe("Lumi (record s2)");
    expect(copy.distinctName(c, list)).toBe("Lumi (record s3)");
    expect(copy.distinctName(loner, list)).toBe("Kwikila");
    const names = list.map((s) => copy.distinctName(s, list));
    expect(new Set(names).size).toBe(names.length);
  });

  it("reads a district that arrives as an empty string, or only whitespace or zero-width characters, as blank", () => {
    // The API sends a blank district as "", not null.
    for (const blank of ["", "  ", "\u200B", " \u200B\uFEFF "]) {
      const x = school({ id: "d1", name: "Lumi ", district: blank, province: "West" });
      const y = school({ id: "d2", name: "Lumi", district: "South", province: "West" });
      const tag = JSON.stringify(blank);
      expect(copy.locationLine(x), tag).toBe("District not recorded, West");
      expect(copy.distinctName(y, [x, y]), tag).toBe("Lumi (South)");
      expect(copy.distinctName(x, [x, y]), tag).toBe("Lumi (record d1)");
      expect(copy.inputSentence(x, "area"), tag).toContain(
        "In its district, which the record does not name,"
      );
      const noProvince = school({ id: "d3", district: blank, province: blank });
      expect(copy.locationLine(noProvince), tag).toBe("Location not recorded");
    }
  });

  it("tells apart two schools that both have a blank name", () => {
    const a = school({ id: "b1", name: null });
    const b = school({ id: "b2", name: "" });
    expect(copy.distinctName(a, [a, b])).toBe("Unnamed school (record b1)");
    expect(copy.distinctName(b, [a, b])).toBe("Unnamed school (record b2)");
    const c = school({ id: "b3", name: "  ", district: "Other" });
    expect(copy.distinctName(c, [a, b, c])).toBe("Unnamed school (Other)");
  });
});

describe("ties", () => {
  const a = school({ id: "t1", name: "Alpha", score: 0.5 });
  const b = school({ id: "t2", name: "Beta", score: 0.5 });
  const c = school({ id: "t3", name: "Gamma", score: 0.5000000000001 });
  const d = school({ id: "t4", name: "Delta", score: 0.4 });
  const all = [a, b, c, d];

  it("notes a school level with another on screening score, on the card and the row", () => {
    expect(copy.tieNote(a, "additive_u", all, "card")).toBe(
      "It has exactly the same screening score as Beta, so the order goes by school name."
    );
    expect(copy.tieNote(a, "additive_u", all, "row")).toBe("Level with Beta");
  });

  it("treats scores as equal only when they are exactly equal, as the engine does", () => {
    // Gamma is 1e-13 above Alpha. The engine orders them by score, so they are not tied.
    expect(copy.tieNote(c, "additive_u", all)).toBeNull();
    expect(copy.tieNote(a, "additive_u", [a, c])).toBeNull();
    const x = school({ id: "e1", name: "Echo", score: 0.1 + 0.2 });
    const y = school({ id: "e2", name: "Foxtrot", score: 0.3 });
    expect(0.1 + 0.2 === 0.3).toBe(false);
    expect(copy.tieNote(x, "additive_u", [x, y])).toBeNull();
    const z = school({ id: "e3", name: "Golf", score: 0.1 + 0.2 });
    expect(copy.tieNote(x, "additive_u", [x, z], "row")).toBe("Level with Golf");
  });

  it("notes nothing for a school that is level with no one, or is not complete", () => {
    expect(copy.tieNote(d, "additive_u", all)).toBeNull();
    expect(
      copy.tieNote(school({ id: "r", cohort: "interval", bounds: [3, 4] }), "additive_u", all)
    ).toBeNull();
    expect(copy.tieNote(school({ id: "q", cohort: "queue" }), "additive_u", all)).toBeNull();
    expect(copy.tieNote(a, "additive_u", [a])).toBeNull();
  });

  it("does not count a school with no score as level", () => {
    const none = {
      ...school({ id: "n" }),
      results: { additive_u: { rank_complete120: 9, score_point: null } },
    };
    expect(copy.tieNote(none, "additive_u", [...all, none])).toBeNull();
    expect(copy.tieNote(a, "additive_u", [...all, none])).not.toContain("School n");
  });

  it("says a tie between schools whose names differ only in spacing goes by the name as recorded", () => {
    const x = school({ id: "x1", name: "Lumi ", score: 0.7, district: "North" });
    const y = school({ id: "x2", name: "Lumi", score: 0.7, district: "South" });
    expect(copy.tieNote(x, "additive_u", [x, y])).toBe(
      "It has exactly the same screening score as Lumi (South), so the order goes by the name as recorded, which differs only in spacing."
    );
  });

  it("breaks a school-need tie by the other inputs, and says by name only when every input is level", () => {
    const n1 = school({ id: "n1", name: "One", need: 0.6, secondary: 0.3 });
    const n2 = school({ id: "n2", name: "Two", need: 0.6, secondary: 0.3 });
    const n3 = school({ id: "n3", name: "Three", need: 0.6, secondary: 0.1 });
    expect(copy.tieNote(n1, "need_first_u", [n1, n2], "card")).toBe(
      "It has exactly the same school need and other inputs as Two, so the order goes by school name."
    );
    expect(copy.tieNote(n1, "need_first_u", [n1, n2, n3], "card")).toBe(
      "It has exactly the same school need as Two and Three, so the other inputs decide which comes first."
    );
    expect(copy.tieNote(n1, "need_first_u", [n1, n2, n3], "row")).toBe("Same school need as Two and Three");
    expect(copy.tieNote(n1, "additive_u", [n1, n2, n3], "card")).toContain(
      "exactly the same screening score"
    );
  });
});

describe("a missing reading", () => {
  type Reading = "aqi" | "emissions" | "land";
  const subsets = [
    [],
    ["aqi"],
    ["emissions"],
    ["land"],
    ["aqi", "emissions"],
    ["emissions", "land"],
    ["aqi", "land"],
    ["aqi", "emissions", "land"],
  ] as const;

  it.each(subsets.filter((s) => s.length).map((s) => [s]))(
    "is named, never counted as 0, when %j is missing",
    (blank) => {
      const s = school({ id: "r", cohort: "interval", bounds: [4, 9], blank: [...blank] });
      const corpus = new Corpus();
      for (const rule of RULES) {
        corpus.add(`rank ${rule}`, P.rankSentence(s, rule));
        corpus.add(`context ${rule}`, P.placeContext(s, rule));
      }
      for (const key of ["air", "emissions", "land"] as const) {
        const field = { air: "aqi", emissions: "emissions", land: "land" }[key] as Reading;
        const said = P.inputSentence(s, key);
        corpus.add(`input ${key}`, said);
        corpus.add(`note ${key}`, P.missingValueNote(s, key));
        if ((blank as readonly string[]).includes(field)) {
          expect(said, key).toMatch(/not recorded/);
          expect(said, key).not.toMatch(/lists no|none of the area|reaches|account for/);
          expect(P.missingValueKind(s, key), key).toBe("unresolved");
          expect(P.missingValueNote(s, key), key).toMatch(
            /is recorded for this school, so it is not counted as 0\. The school shows a range of places instead of one place\.$/
          );
        } else {
          expect(P.missingValueKind(s, key), key).toBe("recorded");
          expect(P.missingValueNote(s, key), key).toBe("Recorded in the source.");
        }
      }
      expect(corpus.problems).toEqual([]);
    }
  );

  it("names all three when all three are missing", () => {
    const s = school({ id: "r", cohort: "interval", bounds: [4, 9], blank: ["aqi", "emissions", "land"] });
    expect(P.rankSentence(s, "additive_u")).toContain(
      "Its air-quality reading, nearby emissions figure and land-cover figure are not recorded, so the screen shows"
    );
    expect(P.missingSentence(s, "additive_u")).toBe(
      "Its air-quality reading, nearby emissions figure and land-cover figure are not recorded. Every other input is recorded."
    );
    expect(P.missingSentences(s, "additive_u")).toHaveLength(2);
  });

  it("says one of its readings is missing when the flags and raw values give no name", () => {
    const s = {
      ...school({ id: "r", cohort: "interval", bounds: [4, 9] }),
      missing_env: { aqi: false, emissions: false, land: false },
    };
    expect(P.missingSentence(s, "additive_u")).toBe(
      "One of its readings is missing. Every other input is recorded."
    );
  });

  it("reads a blank raw reading as missing even when the flag was never set", () => {
    const base = school({ id: "r", cohort: "interval", bounds: [4, 9] });
    const s = { ...base, raw: { ...base.raw, E_raw: null } };
    expect(P.missingSentence(s, "additive_u")).toBe(
      "Its nearby emissions figure is not recorded. Every other input is recorded."
    );
  });

  it("reads a recorded 0 for emissions and land as a value, not a gap", () => {
    const base = school({ id: "a", place: 1 });
    const s = { ...base, raw: { Q_raw: 83, E_raw: 0, L_raw: 0 } };
    expect(P.inputSentence(s, "emissions")).toBe(
      "The Climate TRACE inventory lists no fixed emission sources within 10 km."
    );
    expect(P.inputSentence(s, "land")).toBe(
      "Satellite maps class none of the area within 500 m as water or flooded vegetation."
    );
    expect(P.missingValueKind(s, "emissions")).toBe("recorded");
  });
});

describe("one input at a time", () => {
  const withCondition = (
    condition: Partial<CopySchool["condition"]>,
    extra: Partial<CopySchool> = {}
  ): CopySchool => ({
    ...school({ id: "c", condition }),
    ...extra,
  });
  const say = (s: CopySchool, key: InputKey) => copy.inputSentence(s, key);

  it.each([
    [{ classrooms_total: null }, "The total number of classrooms is not recorded."],
    [{ classrooms_total: 0 }, "The record gives 0 classrooms in total, which needs checking."],
    [
      { classrooms_total: 5, classrooms_permanent: null },
      "The record gives 5 classrooms, but not how many are built of permanent materials.",
    ],
    [
      { classrooms_total: 1, classrooms_permanent: null },
      "The record gives 1 classroom, but not how many are built of permanent materials.",
    ],
    [{ classrooms_total: 1, classrooms_permanent: 1 }, "Its one classroom is built of permanent materials."],
    [
      { classrooms_total: 1, classrooms_permanent: 0 },
      "Its one classroom is not built of permanent materials.",
    ],
    [
      { classrooms_total: 6, classrooms_permanent: 0 },
      "None of its 6 classrooms is built of permanent materials.",
    ],
    [
      { classrooms_total: 4, classrooms_permanent: 4 },
      "All 4 of its classrooms are built of permanent materials.",
    ],
    [
      { classrooms_total: 9, classrooms_permanent: 1 },
      "1 of its 9 classrooms is built of permanent materials.",
    ],
    [
      { classrooms_total: 9, classrooms_permanent: 4 },
      "4 of its 9 classrooms are built of permanent materials.",
    ],
  ] as const)("classrooms %j", (condition, want) => {
    expect(say(withCondition(condition), "classrooms")).toBe(want);
  });

  it.each([
    [
      { teachers: null, teacher_houses: null },
      "The numbers of teachers and teacher houses are not recorded.",
    ],
    [{ teachers: null, teacher_houses: 3 }, "The number of teachers is not recorded."],
    [{ teachers: 0, teacher_houses: 3 }, "The record gives 0 teachers, which needs checking."],
    [
      { teachers: 10, teacher_houses: null },
      "The number of teacher houses for its 10 teachers is not recorded.",
    ],
    [
      { teachers: 1, teacher_houses: null },
      "The number of teacher houses for its one teacher is not recorded.",
    ],
    [{ teachers: 10, teacher_houses: 0 }, "It has no teacher houses for its 10 teachers."],
    [{ teachers: 1, teacher_houses: 1 }, "It has 1 teacher house for its one teacher."],
    [{ teachers: 10, teacher_houses: 4 }, "It has 4 teacher houses for its 10 teachers."],
  ] as const)("housing %j", (condition, want) => {
    expect(say(withCondition(condition), "housing")).toBe(want);
  });

  it("facilities", () => {
    const none = {
      libraries: 0,
      workshops: 0,
      practical_skills: 0,
      home_economics: 0,
      computer_labs: 0,
      specialized_classrooms: 0,
    };
    expect(
      say(
        withCondition({
          ...none,
          libraries: null,
          workshops: null,
          practical_skills: null,
          home_economics: null,
          computer_labs: null,
          specialized_classrooms: null,
        }),
        "facilities"
      )
    ).toBe("Its facility counts are not recorded.");
    expect(say(withCondition({ ...none, libraries: null, workshops: null }), "facilities")).toBe(
      "Two of its six facility counts are not recorded."
    );
    expect(say(withCondition({ ...none, libraries: null }), "facilities")).toBe(
      "One of its six facility counts is not recorded."
    );
    expect(say(withCondition(none), "facilities")).toBe(
      "It has none of the six facility types the study counts, such as a library or a workshop."
    );
    expect(
      say(
        withCondition({
          libraries: 2,
          workshops: 1,
          practical_skills: 1,
          home_economics: 1,
          computer_labs: 3,
          specialized_classrooms: 4,
        }),
        "facilities"
      )
    ).toBe("It has all six facility types the study counts.");
    expect(say(withCondition({ ...none, computer_labs: 2 }), "facilities")).toBe(
      "Of the six facility types the study counts, it has only a computer laboratory."
    );
    expect(say(withCondition({ ...none, libraries: 1, workshops: 1 }), "facilities")).toBe(
      "It has no practical-skills room, home-economics room, computer laboratory or special classroom."
    );
  });

  it.each([
    [
      { power_source: "Generator ", water_source: "Tank Water" },
      "Its power comes from a generator and its water from a tank.",
    ],
    [
      { power_source: "PNG Power", water_source: "River" },
      "Its power comes from the PNG Power grid and its water from a river.",
    ],
    [
      { power_source: "Solar", water_source: "Brining Water From Home" },
      "Its power comes from solar panels, and its water is brought from home.",
    ],
    [
      { power_source: "Hydro", water_source: "Piped Water" },
      "Its power comes from hydro power, and its water is piped.",
    ],
    [
      { power_source: null, water_source: "Well" },
      "Its power source is not recorded. Its water from a well.",
    ],
    [
      { power_source: "Solar", water_source: null },
      "Its power comes from solar panels. Its water source is not recorded.",
    ],
    [{ power_source: null, water_source: null }, "Its power and water sources are not recorded."],
    [
      { power_source: "Coal", water_source: "Well" },
      "Its power source is recorded as Coal, a type that is not on the study's scale.",
    ],
    [
      { power_source: "Solar", water_source: " Rain " },
      "Its water source is recorded as Rain, a type that is not on the study's scale.",
    ],
  ] as const)("services %j", (condition, want) => {
    expect(say(withCondition(condition), "services")).toBe(want);
  });

  it("remoteness", () => {
    expect(say(school({ id: "c", locality: null }), "locality")).toBe(
      "Its remoteness category is not recorded."
    );
    expect(say(school({ id: "c", locality: "  " }), "locality")).toBe(
      "Its remoteness category is not recorded."
    );
    expect(say(school({ id: "c", locality: "Very Remote " }), "locality")).toBe(
      "Its record classes it as very remote, on a six-step remoteness scale from highly accessible to extremely remote."
    );
  });

  it("walking reach", () => {
    const reach = (R: number) =>
      say({ ...school({ id: "c" }), components: { ...school({ id: "c" }).components, R } }, "reach");
    expect(reach(0.9)).toBe("Many people live within modelled walking distance of it.");
    expect(reach(0.67)).toBe("Many people live within modelled walking distance of it.");
    expect(reach(0.5)).toBe("A moderate number of people live within modelled walking distance of it.");
    expect(reach(0.1)).toBe("Relatively few people live within modelled walking distance of it.");
    expect(reach(0)).toBe(
      "Very few people, compared with other schools, live within modelled walking distance of it."
    );
  });

  it("urgency, air quality, emissions and land cover", () => {
    const s = (raw: Partial<CopySchool["raw"]>) => ({
      ...school({ id: "c" }),
      raw: { ...school({ id: "c" }).raw, ...raw },
    });
    expect(say(school({ id: "c" }), "urgency")).toBe(
      "Its urgency value is 0.21 on a 0 to 1 scale. No one could trace where that value comes from."
    );
    expect(say(s({ Q_raw: 1234 }), "air")).toBe(
      "Its air-quality index, a measure of air pollution assigned to its location, reaches 1,234 on its worst 1 day in 20."
    );
    expect(say(s({ Q_raw: null }), "air")).toBe(
      "Its air-quality reading is not recorded. The study assigns an air-pollution index to each school's location, and none was assigned to this one."
    );
    expect(say(s({ E_raw: 165178 }), "emissions")).toBe(
      "Fixed emission sources within 10 km account for about 165,000 tonnes of CO2-equivalent a year in the Climate TRACE inventory."
    );
    expect(say(s({ E_raw: null }), "emissions")).toBe(
      "Its nearby emissions figure is not recorded, so it is not counted as 0."
    );
    expect(say(s({ L_raw: 0.35 }), "land")).toBe(
      "Satellite maps class 35% of the area within 500 m as water or flooded vegetation."
    );
    expect(say(s({ L_raw: 0.0004 }), "land")).toBe(
      "Satellite maps class less than 0.1% of the area within 500 m as water or flooded vegetation."
    );
    expect(say(s({ L_raw: 0.0125 }), "land")).toBe(
      "Satellite maps class 1.3% of the area within 500 m as water or flooded vegetation."
    );
    expect(say(s({ L_raw: null }), "land")).toBe(
      "Its land-cover figure is not recorded, so it is not counted as 0."
    );
  });

  it("district context, framed as a fact about the district and never as the school's own", () => {
    const parts = (
      area: Partial<NonNullable<CopySchool["area_parts"]>>,
      district: string | null = "Middle Fly"
    ) => ({
      ...school({ id: "c", district }),
      area_parts: { ...school({ id: "c" }).area_parts!, ...area },
    });
    expect(say(parts({}), "area")).toBe(
      "In its district, Middle Fly, 60% of students are recorded as moving on from Grade 7 to Grade 10, and 30% from Grade 7 to Grade 12."
    );
    const none = {
      progression10_deficit: 0,
      progression12_deficit: 0,
      secondary_participation_deficit: 0.1,
      activity_deficit: 0.1,
      conflict_exposure: 0.1,
      female_disadvantage: 0,
    };
    expect(say(parts(none), "area")).toBe("In its district, Middle Fly, the district-context value is 0.55.");
    expect(say(parts(none, null), "area")).toBe(
      "In its district, which the record does not name, the district-context value is 0.55."
    );
    expect(say(parts({ ...none, secondary_participation_deficit: 0.9 }), "area")).toBe(
      "In its district, Middle Fly, there are relatively few secondary students for the population."
    );
    expect(say(parts({ ...none, female_disadvantage: 0.6 }), "area")).toContain(
      "girls make up 20% of enrolled students"
    );
  });
});

describe("what is missing from a record", () => {
  /** The cause of a gap, recomputed from the raw fields apart from the copy. */
  const rawCause = (s: CopySchool, field: string): "blank" | "unusable" => {
    const k = s.condition;
    switch (field) {
      case "permanent_classroom_deficit":
        return k.classrooms_total === 0 ? "unusable" : "blank";
      case "teacher_housing_deficit":
        return k.teachers === 0 && k.teacher_houses != null ? "unusable" : "blank";
      case "service_deficit":
        return k.power_source == null || k.water_source == null ? "blank" : "unusable";
      default:
        return "blank";
    }
  };
  const KEY = {
    permanent_classroom_deficit: "classrooms",
    teacher_housing_deficit: "housing",
    facility_presence_deficit: "facilities",
    service_deficit: "services",
  } as const;

  const cases: [string, CopySchool][] = [
    [
      "zero classrooms",
      school({
        id: "q",
        cohort: "queue",
        gate: ["permanent_classroom_deficit"],
        condition: { classrooms_total: 0, classrooms_permanent: 0 },
      }),
    ],
    [
      "blank classroom count",
      school({
        id: "q",
        cohort: "queue",
        gate: ["permanent_classroom_deficit"],
        condition: { classrooms_total: null },
      }),
    ],
    [
      "blank permanent count",
      school({
        id: "q",
        cohort: "queue",
        gate: ["permanent_classroom_deficit"],
        condition: { classrooms_permanent: null },
      }),
    ],
    [
      "zero teachers",
      school({ id: "q", cohort: "queue", gate: ["teacher_housing_deficit"], condition: { teachers: 0 } }),
    ],
    [
      "blank teachers and houses",
      school({
        id: "q",
        cohort: "queue",
        gate: ["teacher_housing_deficit"],
        condition: { teachers: null, teacher_houses: null },
      }),
    ],
    [
      "blank houses",
      school({
        id: "q",
        cohort: "queue",
        gate: ["teacher_housing_deficit"],
        condition: { teacher_houses: null },
      }),
    ],
    [
      "three blank facility counts",
      school({
        id: "q",
        cohort: "queue",
        gate: ["facility_presence_deficit"],
        condition: { libraries: null, workshops: null, practical_skills: null },
      }),
    ],
    ["blank power", school({ id: "q", cohort: "queue", gate: ["service_deficit"], power: null })],
    ["blank water", school({ id: "q", cohort: "queue", gate: ["service_deficit"], water: null })],
    ["both blank", school({ id: "q", cohort: "queue", gate: ["service_deficit"], power: null, water: null })],
    [
      "an unlisted power type",
      school({ id: "q", cohort: "queue", gate: ["service_deficit"], power: "Coal" }),
    ],
    [
      "blank remoteness",
      school({ id: "q", cohort: "queue", gate: ["locality_disadvantage"], locality: null }),
    ],
    [
      "several gaps at once",
      school({
        id: "q",
        cohort: "queue",
        gate: ["permanent_classroom_deficit", "teacher_housing_deficit", "service_deficit"],
        condition: { classrooms_total: 0, teachers: null },
        power: null,
      }),
    ],
  ];

  it.each(cases)("%s: the note, the chip and the sentence agree with the raw cause", (_name, s) => {
    const labels = P.missingLabels(s);
    expect(labels).toHaveLength(s.gate_failures.length);
    s.gate_failures.forEach((field, i) => {
      if (field === "locality_disadvantage") return;
      const want = rawCause(s, field);
      const key = KEY[field as keyof typeof KEY];
      expect(P.missingValueKind(s, key), field).toBe(want);
      if (want === "unusable") {
        expect(labels[i], field).toMatch(/needs checking$/);
        expect(P.missingValueNote(s, key), field).toMatch(/cannot use this value/);
      } else {
        expect(labels[i], field).toMatch(/blank$/);
        expect(P.missingValueNote(s, key), field).toMatch(
          /blank in the record\. The tool does not fill it in or count it as 0\.$/
        );
      }
    });
    const zeroRooms =
      s.gate_failures.includes("permanent_classroom_deficit") && s.condition.classrooms_total === 0;
    expect(/gives 0 classrooms in total/.test(P.missingSentence(s, "additive_u"))).toBe(zeroRooms);
    expect(/gives 0 classrooms in total/.test(P.missingValueNote(s, "need"))).toBe(zeroRooms);
    expect(P.missingValueKind(s, "need")).toBe("not_calculable");
    expect(P.missingValueNote(s, "need")).toMatch(/^School need cannot be worked out, because /);
    expect(P.missingSentence(s, "additive_u")).toMatch(
      /Having no place in the list yet does not mean its need is low\.$/
    );
    expect(P.missingSentences(s, "additive_u").join(" ")).toBe(P.missingSentence(s, "additive_u"));
    const corpus = new Corpus();
    P.missingSentences(s, "additive_u").forEach((t, i) => corpus.add(`sentence ${i}`, t));
    labels.forEach((l, i) => corpus.add(`label ${i}`, l, { sentence: false }));
    expect(corpus.problems).toEqual([]);
  });

  it("writes the zero-classroom chip, note and sentence for the record that gives 0 in total", () => {
    const s = cases[0][1];
    expect(P.missingLabels(s)).toEqual(["Record gives 0 classrooms, needs checking"]);
    expect(P.missingValueNote(s, "need")).toBe(
      "School need cannot be worked out, because the record gives 0 classrooms in total."
    );
    expect(P.missingSentence(s, "additive_u")).toBe(
      "The record gives 0 classrooms in total, which needs checking, and until then the share built of permanent materials cannot be worked out. Until these are checked, its school need cannot be worked out, so it has no place in the list yet. Having no place in the list yet does not mean its need is low."
    );
  });

  it("names a record that gives only its remoteness category", () => {
    const empty = Object.fromEntries(
      Object.keys(school({ id: "x" }).condition).map((k) => [k, null])
    ) as unknown as CopySchool["condition"];
    const s: CopySchool = {
      ...school({
        id: "q",
        cohort: "queue",
        locality: "Remote",
        gate: [
          "permanent_classroom_deficit",
          "teacher_housing_deficit",
          "facility_presence_deficit",
          "service_deficit",
        ],
      }),
      condition: empty,
    };
    expect(P.missingLabels(s)).toEqual(["Only remoteness recorded"]);
    expect(P.missingValueNote(s, "need")).toBe(
      "School need cannot be worked out, because only the remoteness category is recorded."
    );
    expect(P.missingSentences(s, "additive_u")[0]).toBe(
      "Only its remoteness category is recorded, as remote."
    );
    expect(
      copyFor({ counts: { ...COUNTS, remotenessOnly: 1 } }).termsFor("additive_u").missing_all_but_remoteness
        .help
    ).toBe(
      "1 of the 4 incomplete records are like this. Classroom, teacher, housing, facility, power and water details are all blank."
    );
  });

  it("adds a sentence when the remoteness category is blank but not among the gaps", () => {
    const s = school({
      id: "q",
      cohort: "queue",
      gate: ["permanent_classroom_deficit"],
      condition: { classrooms_total: null },
      locality: null,
    });
    expect(P.missingSentences(s, "additive_u")).toContain("The remoteness category is blank in the record.");
  });

  it("says a complete school has every input and a range school only its readings missing", () => {
    expect(P.missingSentence(school({ id: "a" }), "additive_u")).toBe("All of its inputs are recorded.");
    expect(P.missingLabels(school({ id: "a" }))).toEqual([]);
    expect(P.missingValueKind(school({ id: "a" }), "need")).toBe("recorded");
    expect(P.missingValueKind(school({ id: "a" }), "classrooms")).toBe("recorded");
  });

  it("refuses an input it has no words for", () => {
    expect(() => P.missingValueKind(school({ id: "a" }), "nope" as never)).toThrow("No input called nope");
    expect(() => P.inputSentence(school({ id: "a" }), "nope" as never)).toThrow("No input called nope");
  });
});

describe("why a school sits where it does, from the engine's own scores", () => {
  const detail = fixtureDetail(KEYS.complete);
  const s = schoolFromDetail(detail, "additive_u");

  it.each(RULES)("the contributions under %s add up to the engine's score", (rule) => {
    const entry = detail.rules.find((r) => r.rule.rule_id === rule);
    if (!entry) throw new Error(`no ${rule} in the saved school`);
    const want = rule.startsWith("need_first")
      ? 5 * (entry.result.scores.sort_key_primary as number)
      : (entry.result.scores.point as number);
    const contrib = copy.contributions(s, rule);
    if (!contrib) throw new Error(`no contributions under ${rule}`);
    const sum = Object.values(contrib).reduce<number>((a, v) => a + (v ?? 0), 0);
    expect(Math.abs(sum - want)).toBeLessThan(1e-9);
  });

  it("names the three needs that add most to a complete school, in order, with its own record", () => {
    expect(copy.reasonSentence(s, "additive_u")).toBe(
      "Three things add most to its screening score under the combined-factors rule with urgency (S). All three are parts of its school need, the measure built from five parts of its own record. None of its 8 classrooms is built of permanent materials. Its record classes it as very remote, on a six-step remoteness scale from highly accessible to extremely remote. It has 2 teacher houses for its 10 teachers."
    );
    expect(copy.topDrivers(s, "additive_u").map((d) => d.key)).toEqual(["classrooms", "locality", "housing"]);
  });

  it("explains a need-first order by the parts of school need alone", () => {
    const text = copy.reasonSentence(s, "need_first_u");
    expect(
      text.startsWith(
        "Under the need-first rule with urgency (NF), school need sets the order, and other inputs only break exact ties. School need is built from five parts of the school's own record. Three parts raise its school need most."
      )
    ).toBe(true);
    expect(
      copy
        .topDrivers(s, "need_first_u")
        .every((d) => ["classrooms", "housing", "facilities", "services", "locality"].includes(d.key))
    ).toBe(true);
  });

  it("never mentions urgency under a rule that leaves it out, and says which input a largest-factor rule favours", () => {
    for (const rule of RULES.filter((r) => !copy.ruleUsesUrgency(r))) {
      const text = copy.reasonSentence(s, rule).split(copy.ruleName(rule)).join("");
      expect(text, rule).not.toMatch(/urgency/i);
      expect(copy.topDrivers(s, rule).some((d) => d.key === "urgency")).toBe(false);
    }
    expect(copy.reasonSentence(s, "bottleneck_no_u")).toMatch(
      /This rule gives an extra share to the larger of school need and district context\. For this school that is school need\.$/
    );
    expect(copy.reasonSentence(s, "bottleneck_u")).toMatch(
      /the largest of school need, district context and the urgency value\. For this school that is school need\.$/
    );
  });

  it("orders drivers by size, and names an input that ties the last one picked", () => {
    const tie = school({ id: "t" });
    const flat = {
      ...tie,
      contributions: {
        additive_u: {
          components: {
            ...tie.contributions!.additive_u!.components,
            permanent_classroom_deficit: 0.2,
            teacher_housing_deficit: 0.2,
            facility_presence_deficit: 0.2,
            service_deficit: 0.0,
            locality_disadvantage: 0.0,
            area: 0,
            urgency: 0,
            reach: 0,
            aqi_lower: 0,
            aqi_upper: 0,
            emissions_lower: 0,
            emissions_upper: 0,
            land_lower: 0,
            land_upper: 0,
          },
        },
      },
    };
    expect(copy.topDrivers(flat, "additive_u").map((d) => d.key)).toEqual([
      "classrooms",
      "housing",
      "facilities",
    ]);
  });

  it("leaves out an input that adds nothing, and says so when none adds anything", () => {
    const base = school({ id: "z" });
    const zero = Object.fromEntries(
      Object.keys(base.contributions!.additive_u!.components).map((k) => [k, 0])
    );
    const s0 = { ...base, contributions: { additive_u: { components: zero as never } } };
    expect(copy.topDrivers(s0, "additive_u")).toEqual([]);
    expect(copy.reasonSentence(s0, "additive_u")).toBe(
      "Under the combined-factors rule with urgency (S), none of its inputs adds to its screening score."
    );
  });

  it("says a school with an incomplete record has nothing to explain", () => {
    const q = school({ id: "q", cohort: "queue", gate: ["service_deficit"] });
    expect(copy.reasonSentence(q, "additive_u")).toBe(
      "This school has no place in the list yet, so there is no screening score to explain. Its entry shows what is missing."
    );
    expect(copy.topDrivers(q, "additive_u")).toEqual([]);
    expect(copy.contributions(q, "additive_u")).toBeNull();
  });

  it("reads a range school's missing air quality as no driver", () => {
    const interval = schoolFromDetail(fixtureDetail(KEYS.interval), "additive_u");
    const contrib = copy.contributions(interval, "additive_u");
    expect(contrib?.air).toBeNull();
    for (const rule of RULES)
      expect(copy.topDrivers(interval, rule).some((d) => d.key === "air")).toBe(false);
  });
});

describe("the sentences over the saved synthetic schools", () => {
  const results = RULES.map((r) => fixtureResults(r));
  const details = Object.values(KEYS).map((k) => fixtureDetail(k));

  it("pass the writing guards for every school and rule", () => {
    const corpus = new Corpus();
    const names = fixtureResults("additive_u").rows.map((r) => r.school.source_school_name);
    for (const d of details) {
      for (const rule of RULES) {
        const s = schoolFromDetail(d, rule);
        const tag = `${s.name} ${rule}`;
        const opts = { schoolNames: names };
        corpus.add(`${tag} reason`, copy.reasonSentence(s, rule), opts);
        corpus.add(`${tag} missing`, copy.missingSentence(s, "additive_u"), opts);
        for (const key of ["need", ...copy.INPUT_KEYS] as const)
          corpus.add(`${tag} note ${key}`, copy.missingValueNote(s, key), opts);
        if (s.cohort !== "queue")
          for (const key of copy.INPUT_KEYS)
            corpus.add(`${tag} input ${key}`, copy.inputSentence(s, key), opts);
        const P2 = copyFor({ counts: countsFromResults(results[0]) });
        for (const o of [{}, { name: true, shortlist: 20 }])
          corpus.add(`${tag} rank`, P2.rankSentence(s, rule, o), opts);
        corpus.add(`${tag} full`, P2.fullRankingSentence(s, rule), opts);
        corpus.add(`${tag} context`, P2.placeContext(s, rule, { method: true }), opts);
        corpus.add(`${tag} headline`, P2.placeHeadline(s, rule), { ...opts, sentence: false });
      }
    }
    expect(corpus.problems).toEqual([]);
    expect(corpus.checked).toBeGreaterThan(500);
  });
});

describe("what the port refuses where the prototype would have coerced", () => {
  it("does not quote a figure that a school put in order must have, instead of reading a blank as 0", () => {
    const base = school({ id: "z" });
    const noUrgency = { ...base, components: { ...base.components, U: null } };
    const noReach = { ...base, components: { ...base.components, R: null } };
    expect(() => copy.inputSentence(noUrgency, "urgency")).toThrow("has no urgency value");
    expect(() => copy.inputSentence(noReach, "reach")).toThrow("has no reach value");
    expect(() => copy.contributions(noUrgency, "benchmark")).toThrow("has no urgency value");
  });

  it("falls back to the count-free groups sentence when the range count is known but the ordered count is not", () => {
    expect(copy.groupsSentence({ complete: 2, range: 1 })).toBe(
      "Schools with every input recorded have one place each, and schools that lack a reading such as air quality show a range of places; together they can be put in order."
    );
  });
});
