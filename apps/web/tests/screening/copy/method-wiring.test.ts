/**
 * What the method layer's components read from the copy, instead of restating it.
 *
 * Failure modes, each with the test that catches it:
 *  1. The page restates the edges that sort a move into a bin, so the key's labels and the colours of the chart can
 *     drift apart. The copy hands the edges out with the words that use them.
 *  2. A sheet title carries `<em>` in its string, and the page renders markup from a string. The title has a segments
 *     form that marks the rule's name, and the string form is the plain text of it.
 *  3. The locality chip does not name the class it filters by, or reads as the province chip.
 *  4. A comparison and the top-list file load under the same words as the schools, so a reader cannot tell what
 *     is still loading.
 */
import { describe, expect, it } from "vitest";

import * as copy from "@/lib/screening/copy";
import { LAYOUT, copyFor, textOf } from "@/lib/screening/copy";
import { METHOD, buildMethod } from "@/lib/screening/copy/method";

import { textProblems } from "./helpers";

describe("the edges of the places-moved bins", () => {
  it("come with the method words, and word the key's bins", async () => {
    const m = await copyFor({}).methodFor("additive_u");
    expect(m.compare.moveEdges).toEqual([4, 14]);
    expect(m.compare.moveBins(m.compare.moveEdges)).toEqual(m.compare.moveBins());
    expect(m.compare.moveBins([2, 9])).toEqual(["10+", "3 to 9", "1 to 2", "0", "1 to 2", "3 to 9", "10+"]);
    expect(METHOD.compare.moveEdges).toBe(buildMethod().compare.moveEdges);
  });
});

describe("the sheet title", () => {
  it("has no markup in its string, and a segments form that marks the rule's name", async () => {
    const m = await copyFor({}).methodFor("additive_u");
    expect(m.sheet.title(20, "Combined")).toBe("First 20, Combined");
    expect(m.segments.sheetTitle(20, "Combined")).toEqual(["First 20, ", { name: "Combined", kind: "rule" }]);
    expect(textOf(m.segments.sheetTitle(20, "Combined"))).toBe(m.sheet.title(20, "Combined"));
    for (const text of [m.sheet.title(20, "Combined"), m.sheet.lede(20, "X", true), m.sheet.ledeCompare("X")])
      expect(text).not.toMatch(/[<>]/);
  });
});

describe("the locality chip", () => {
  it("names the remoteness class it filters by, whatever the class, in clean text", async () => {
    const m = await copyFor({}).methodFor("additive_u");
    for (const value of ["Remote", "Very remote", "Extremely Remote"]) {
      const chip = m.filter.chipLocality(value);
      expect(chip.endsWith(value)).toBe(true);
      expect(chip).not.toBe(m.filter.chipProvince(value));
      expect(textProblems(chip, { sentence: false })).toEqual([]);
    }
  });
});

describe("the words for a comparison and the top-list file that are loading, and for the school column", () => {
  it("say which thing is loading, each its own, in clean text", () => {
    const loading = [LAYOUT.loading, LAYOUT.loadingComparison, LAYOUT.loadingTopList];
    expect(new Set(loading).size).toBe(loading.length);
    for (const t of [LAYOUT.loadingComparison, LAYOUT.loadingTopList, LAYOUT.schoolHead])
      expect(textProblems(t, { sentence: false }), t).toEqual([]);
  });
});

describe("the words the export sheet, the compare map and chart, and the missing-detail chips read", () => {
  it("say that the file is not cut by remoteness, in one plain sentence", () => {
    expect(LAYOUT.fileNotByRemoteness).toBe(
      "The file follows the province filter but not the remoteness filter, so it can list schools you do not see here."
    );
    expect(textProblems(LAYOUT.fileNotByRemoteness), LAYOUT.fileNotByRemoteness).toEqual([]);
  });

  it("name the plain download from the rule's plain label and the length, with no rule letters", () => {
    expect(LAYOUT.topListFileName(20, "Combined factors, with urgency")).toBe(
      "rise-png-top-20-combined-factors-with-urgency.csv"
    );
    expect(LAYOUT.topListFileName(10, "Need first, no urgency")).toBe(
      "rise-png-top-10-need-first-no-urgency.csv"
    );
    // Accents go, a letter in brackets (a rule's letter) goes, and nothing a file name cannot hold stays.
    expect(LAYOUT.topListFileName(30, 'Équipe / mix (S0): "a" b')).toBe("rise-png-top-30-equipe-mix-a-b.csv");
    for (const rule of copy.RULE_IDS)
      for (const n of [10, 20, 30])
        expect(LAYOUT.topListFileName(n, copy.ruleLabel(rule)), `${rule} ${n}`).toMatch(
          /^rise-png-top-\d+(?:-[a-z]{2,})+\.csv$/
        );
  });

  it("key the colour of a school outside the comparison, and head the chart's accessible table", async () => {
    const m = await copyFor({}).methodFor("additive_u");
    expect(m.compare.legendOutside).toBe("Not in the comparison");
    expect(m.compare.table.school).toBe("School");
    expect(m.compare.table.place("Combined")).toBe("Rank under Combined");
    expect(m.compare.table.move).toBe("Ranks moved");
    for (const t of [
      m.compare.legendOutside,
      m.compare.table.school,
      m.compare.table.place("Combined"),
      m.compare.table.move,
    ])
      expect(textProblems(t, { sentence: false }), t).toEqual([]);
  });

  it("head the chips for the parts a record can lack with words that hold whatever the cause", async () => {
    const m = await copyFor({}).methodFor("additive_u");
    expect(m.queue.missingEyebrow).toBe("Missing detail");
    expect(m.queue.parts).toEqual({
      permanent_classroom_deficit: "Classroom count",
      teacher_housing_deficit: "Teacher or house count",
      facility_presence_deficit: "Facility counts",
      service_deficit: "Power or water source",
    });
    // A chip filters records that lack the part blank, at 0, negative or off the scale, so it names the part, not one cause.
    for (const text of Object.values(m.queue.parts))
      expect(text).not.toMatch(/blank|recorded as 0|negative|off the scale/i);
  });
});
