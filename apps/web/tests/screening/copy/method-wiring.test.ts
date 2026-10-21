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
