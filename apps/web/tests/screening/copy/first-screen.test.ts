/**
 * The words a first visit shows.
 *
 * Failure modes, each with the test that catches it:
 *  1. The list intro carries the group counts again (complete, range, not in the list), so the first line is a wall
 *     of numbers; or the detail behind Read more loses them.
 *  2. A rule's one-line description leaks a symbol (S0, S, B), a term of art or the word "rule", or says nothing
 *     about the urgency rating where the rule uses it, so a quiet rule area misdescribes how the list is ordered.
 *  3. A rule has no description, so its quiet area is blank.
 *  4. The region after a school's name reads as a district, or a blank region prints "null".
 *  5. A single school reads "1 schools are in the list".
 */
import { describe, expect, it } from "vitest";

import * as copy from "@/lib/screening/copy";

import { textProblems } from "./helpers";

const COUNTS = { all: 131, complete: 105, range: 6, ranked: 111, queue: 70 };
// Counts picked so no group number equals the number of schools in the list.
const DISTINCT = { all: 150, complete: 97, range: 13, ranked: 110, queue: 41 };

describe("the list intro", () => {
  it("says only how many schools are in the list, and keeps the groups behind Read more", () => {
    const { scopeShort, scopeDetail } = copy.buildScope(DISTINCT);
    expect(scopeShort).toBe("110 schools are in the list.");
    for (const n of ["97", "13", "41", "150"]) expect(scopeShort).not.toContain(n);
    for (const n of ["110", "97", "13"]) expect(scopeDetail).toContain(n);
    expect(textProblems(scopeShort)).toEqual([]);
  });

  it("keeps every group count of a larger list out of the first line", () => {
    const { scopeShort } = copy.buildScope(COUNTS);
    expect(scopeShort).toBe("111 schools are in the list.");
    expect(scopeShort).not.toMatch(/\b(131|105|70|6)\b/);
  });

  it("reads in the singular for one school, and says plainly when there are none", () => {
    expect(copy.buildScope({ ...DISTINCT, ranked: 1, complete: 1, range: 0 }).scopeShort).toBe(
      "1 school is in the list."
    );
    expect(copy.buildScope({ ...DISTINCT, ranked: 0, complete: 0, range: 0 }).scopeShort).toBe(
      "No school can be put in order."
    );
  });

  it("says something true without counts, instead of a number it does not have", () => {
    const { scopeShort } = copy.buildScope({});
    expect(scopeShort).not.toMatch(/\d/);
    expect(textProblems(scopeShort)).toEqual([]);
  });
});

describe("the one-line description of each rule", () => {
  it("exists for all seven rules, as plain words with no symbol or term of art", () => {
    expect(copy.RULE_IDS).toHaveLength(7);
    for (const id of copy.RULE_IDS) {
      const line = copy.LAYOUT.ruleNow(id);
      expect(textProblems(line), id).toEqual([]);
      expect(line.split(/\s+/).length, id).toBeLessThanOrEqual(40);
      expect(line, id).not.toMatch(/\brules?\b|\(S0?\)|\(B\)|combined[- ]factors|\bS0\b|research paper/i);
      expect(textProblems(copy.rulePlainName(id), { sentence: false }), id).toEqual([]);
    }
  });

  it("says what the list uses, and leaves urgency out of a rule that does not use it", () => {
    for (const id of copy.RULE_IDS) {
      const line = copy.LAYOUT.ruleNow(id);
      expect(line, id).not.toMatch(/\b(leaves?|left) out\b|\buncertain\b/i);
      expect(line, id).not.toMatch(/\burgency\b(?! rating)/i);
      if (copy.ruleUsesUrgency(id)) expect(line, id).toMatch(/urgency rating/);
      else expect(line, id).not.toMatch(/urgency/i);
    }
    expect(copy.LAYOUT.ruleNow("additive_no_u")).toMatch(/^Ordered mainly by school need \(about 63%\)/);
  });

  it("states only shares that the rule's own explanation states", () => {
    for (const id of copy.RULE_IDS) {
      for (const share of copy.LAYOUT.ruleNow(id).match(/\d+%/g) ?? [])
        expect(copy.ruleExplanation(id), `${id} ${share}`).toContain(share);
    }
  });

  it("tells the seven apart", () => {
    const lines = copy.RULE_IDS.map((id) => copy.LAYOUT.ruleNow(id));
    expect(new Set(lines).size).toBe(7);
  });
});

describe("the region after a school's name", () => {
  it("says province unless the record already says what the region is", () => {
    expect(copy.provinceLabel("Morobe")).toBe("Morobe province");
    expect(copy.provinceLabel("  Western Highlands ")).toBe("Western Highlands province");
    expect(copy.provinceLabel("Western Province")).toBe("Western Province");
    expect(copy.provinceLabel("National Capital District")).toBe("National Capital District");
  });

  it("returns null for a blank region, never the text null", () => {
    for (const blank of [null, undefined, "", "   "]) expect(copy.provinceLabel(blank)).toBeNull();
  });
});

describe("the compact key beside the map", () => {
  it("names the three marks in the words the full key and the list use", () => {
    const { keyDot, keyRange, keyRing } = copy.LAYOUT;
    for (const text of [keyDot, keyRange, keyRing])
      expect(textProblems(text, { sentence: false })).toEqual([]);
    expect(keyDot).toMatch(/rank/);
    expect(keyRange).toMatch(/range of ranks/);
    expect(keyRing).toMatch(/not in the list yet/i);
    expect(copy.TERMS.mark_range.line).toMatch(/range of possible ranks/);
    expect(copy.TERMS.mark_ring.line).toMatch(/not in the list yet/);
  });

  it("reads the colour strip from the first and last rank it was given", () => {
    expect(copy.LAYOUT.keyRamp("1st", "99th")).toBe("Darker is earlier in the list: 1st to 99th");
  });

  it("says the strip covers the schools with one rank, so it can end below the number in the list", () => {
    expect(copy.LAYOUT.keyRamp("1st", "131st", 131)).toBe(
      "Darker is earlier in the list: 1st to 131st, among the 131 schools with one rank"
    );
    expect(copy.LAYOUT.keyRamp("1st", "1st", 1)).toMatch(/among the one school with one rank$/);
    expect(copy.LAYOUT.keyRampNote(131, 7)).toBe(
      "The colours show the 131 schools with one rank. The 7 schools with a range of ranks are shown apart."
    );
    expect(copy.LAYOUT.keyRampNote(7, 1)).toMatch(/The 1 school with a range of ranks is shown apart\.$/);
    expect(copy.LAYOUT.keyRampNote(20, 0)).toBe("The colours show all 20 schools in the list.");
    for (const text of [copy.LAYOUT.keyRampNote(131, 7), copy.LAYOUT.keyRampNote(20, 0)])
      expect(textProblems(text)).toEqual([]);
  });

  it("names the numbered circles", () => {
    expect(textProblems(copy.LAYOUT.keyNumbers, { sentence: false })).toEqual([]);
    expect(copy.LAYOUT.keyNumbers).toMatch(/first ten in the list/);
  });
});
