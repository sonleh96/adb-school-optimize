/**
 * Binding the copy to the API's responses at one boundary.
 *
 * Failure modes, each with the test that catches it:
 *  1. A caller binds the copy to the shown rule's counts only, so a school under two rules is said against one
 *     group: `copyFor` refuses counts that come with several rules' results but no counts for each rule.
 *  2. A rule the caller gave no counts for borrows the shown rule's counts: given as an object, the counts are the
 *     whole truth, and a missing rule has unknown counts.
 *  3. The easy way (`bindCopy`) misses part of what the page needs: the records, each rule's counts, the recorded
 *     comparison and the persistence margin all arrive from the responses alone.
 */
import { describe, expect, it } from "vitest";

import * as copy from "@/lib/screening/copy";
import { bindCopy, countsFromResults, copyFor } from "@/lib/screening/copy";
import { ParseError, parseWith } from "@/lib/screening/schema";
import { inputsResponse } from "@/lib/screening/types";

import { readFixture } from "../fixtures";
import { RULES, fixtureCompare, fixtureResults } from "./helpers";

const inputs = parseWith(inputsResponse, readFixture("inputs.json"), "inputs");
const lists = RULES.map((r) => fixtureResults(r));
const S = "the combined-factors rule with urgency (S)";
const B = "the conventional benchmark (B)";

describe("bindCopy", () => {
  const bound = bindCopy({ view: "additive_u", inputs, lists, compare: fixtureCompare() });
  const s08 = bound.schools.find((s) => s.name === "Sample School 08");

  it("gives a full record for each row of the list shown", () => {
    expect(bound.schools).toHaveLength(25);
    expect(copy.topDrivers(s08 as never, "additive_u").length).toBeGreaterThan(0);
  });

  it("counts each rule's own group when it puts one school under two rules", () => {
    expect(bound.copy.rangeComparisonSentence(s08 as never, "additive_u", "benchmark")).toBe(
      `Under ${S}, Sample School 08 is 1st among the 16 schools with every input recorded. Under ${B}, it is 4th among the 21 schools with a record for every input the rule uses.`
    );
  });

  it("counts the shown rule's groups, and the counts that need every record", () => {
    expect(bound.copy.counts).toMatchObject({ complete: 16, range: 5, ranked: 21, queue: 4 });
    expect(bound.copy.counts).toHaveProperty("emissionsNone");
    expect(bound.copy.counts).toHaveProperty("flagged");
  });

  it("uses the recorded comparison and the persistence margin", () => {
    expect(bound.copy.comparisonSentence("additive_u", "additive_no_u")).toContain(
      "among the 16 schools with every input recorded."
    );
    const flagged = bound.schools.find((s) => s.name === "Sample School 02");
    expect(bound.copy.persistenceNote(flagged as never, "additive_u")[1]).toContain(
      "within 0.6 percentage points of the line"
    );
  });

  it("is refused when the list of the rule shown is missing", () => {
    expect(() => bindCopy({ view: "additive_u", inputs, lists: lists.slice(1) })).toThrow(ParseError);
  });

  it("works without a comparison", () => {
    const plain = bindCopy({ view: "additive_no_u", inputs, lists });
    expect(plain.copy.comparisonSentence("additive_u", "additive_no_u")).toBe(
      "No recorded comparison exists for the combined-factors rule with urgency (S) and the combined-factors rule without urgency (S0)."
    );
  });
});

describe("copyFor with counts and several rules' results", () => {
  const placed = bindCopy({ view: "additive_u", inputs, lists }).schools;
  const counts = countsFromResults(lists[0]);

  it("refuses to guess that every rule counts the same groups", () => {
    expect(() => copyFor({ schools: placed, counts })).toThrow(/countsByRule/);
    expect(() => copyFor({ schools: placed, counts })).toThrow(/bindCopy/);
  });

  it('accepts "shared" for data of one run, and counts for a school with one rule', () => {
    expect(() => copyFor({ schools: placed, counts, countsByRule: "shared" })).not.toThrow();
    const one = placed.map((s) => ({ ...s, results: { additive_u: s.results?.additive_u ?? null } }));
    expect(() => copyFor({ schools: one, counts })).not.toThrow();
    expect(() => copyFor({ counts })).not.toThrow();
  });

  it("does not borrow the shown rule's counts for a rule it was not given", () => {
    const s08 = placed.find((s) => s.name === "Sample School 08") as never;
    const only = copyFor({
      schools: placed,
      counts,
      countsByRule: { additive_u: counts },
    });
    expect(only.rankSentence(s08, "benchmark")).toMatch(
      /^4th of the schools with a record for every input the rule uses/
    );
    expect(only.rankSentence(s08, "additive_u")).toMatch(/^1st of the 16 schools with every input recorded/);
    // With one rule unknown, the two places are not said to count the same group.
    expect(only.rangeComparisonSentence(s08, "additive_u", "benchmark")).toBe(
      `Under ${S}, Sample School 08 is 1st among the 16 schools with every input recorded. Under ${B}, it is 4th among the schools with a record for every input the rule uses.`
    );
    const unknownBoth = copyFor({ schools: placed, counts, countsByRule: {} });
    expect(unknownBoth.rangeComparisonSentence(s08, "additive_u", "benchmark")).toBe(
      `Under ${S}, Sample School 08 is 1st among the schools with every input recorded. Under ${B}, it is 4th among the schools with a record for every input the rule uses.`
    );
    const shared = copyFor({ schools: placed, counts, countsByRule: "shared" });
    expect(shared.rangeComparisonSentence(s08, "additive_u", "benchmark")).toMatch(/^Among the 16 schools/);
  });
});
