/**
 * The scope lines and the missing-input sentences are said for the rule shown, and cannot be asked for without one.
 *
 * Failure modes, each with the test that catches it:
 *  1. A screen under the benchmark reads "21 schools have every input recorded ... and 0 that show a range" from
 *     fixed strings built for the paper's main rule; under a rule that leaves urgency out it reads "17 have every
 *     input recorded". The lines are bound per rule, with the rule's own counts and the inputs it reads.
 *  2. `missingSentence(school)` with no rule returns "All of its inputs are recorded." for a school that lacks a
 *     reading. The rule is a required argument, so a plain view cannot reach that form.
 * The lists are the API's own saved responses.
 */
import { describe, expect, it } from "vitest";

import * as copy from "@/lib/screening/copy";
import { countsByRuleFromResults, countsFromResults, schoolsFromLists } from "@/lib/screening/copy";

import { RULES, fixtureInputs, fixtureResults, textProblems } from "./helpers";

const lists = {
  additive_u: fixtureResults("additive_u"),
  additive_no_u: fixtureResults("additive_no_u"),
  benchmark: fixtureResults("benchmark"),
};
const byRule = countsByRuleFromResults(lists.additive_u, lists.additive_no_u, lists.benchmark);
const inputs = fixtureInputs();
const all = [lists.additive_u, lists.additive_no_u, lists.benchmark];
const view = (rule: keyof typeof lists) => {
  const schools = schoolsFromLists(inputs, [lists[rule], ...all.filter((l) => l !== lists[rule])], rule);
  return {
    schools,
    P: copy.copyFor({ schools, counts: countsFromResults(lists[rule]), countsByRule: byRule }),
  };
};

describe("the scope lines", () => {
  const { P } = view("additive_u");

  it("are said for a rule that reads every input as they were", () => {
    expect(P.scope("additive_u").scopeShort).toBe(
      "21 schools can be put in order, 16 with every input recorded and 5 that show a range of places."
    );
    expect(P.scope("additive_u").groups).toBe(
      "16 schools have every input recorded, and five more lack a reading such as air quality and show a range of places, so 21 schools can be put in order."
    );
  });

  it("are said for the benchmark by what it reads, with no range schools to mention", () => {
    const s = P.scope("benchmark");
    expect(s.groups).toBe(
      "21 schools have a record for every input the rule uses, so 21 schools can be put in order."
    );
    expect(s.scopeShort).toBe(
      "21 schools can be put in order, all with a record for every input the rule uses."
    );
    expect(s.scopeComplete).toMatch(/^21 schools have a record for every input the rule uses, so 21 /);
    expect(s.scopeComplete).toMatch(/Single places count among the 21\.$/);
    for (const text of Object.values(s)) expect(text, text).not.toMatch(/every input recorded|0 that show/);
  });

  it("are said for a rule that leaves urgency out by its own group, not the main rule's", () => {
    const s = P.scope("additive_no_u");
    expect(s.scopeShort).toBe(
      "22 schools can be put in order, 17 with a record for every input the rule uses and 5 that show a range of places."
    );
    expect(s.groups).toMatch(/^17 schools have a record for every input the rule uses, and /);
  });

  it("are not on the fixed strings, where no rule could be named", () => {
    for (const key of ["groups", "scopeComplete", "scopeRanked", "scopeShort", "scopeDetail"]) {
      expect(P.STRINGS, key).not.toHaveProperty(key);
      expect(copy.STRINGS, key).not.toHaveProperty(key);
    }
  });
});

describe("every scope line", () => {
  it("passes the writing guards under every rule, with and without counts", () => {
    const { P } = view("additive_u");
    for (const rule of RULES)
      for (const [key, text] of Object.entries(P.scope(rule)))
        expect(textProblems(text, { sentence: key !== "amongAll" }), `${rule} ${key}`).toEqual([]);
    for (const reads of [undefined, { urgency: false, readings: true }, { urgency: true, readings: false }])
      for (const [key, text] of Object.entries(copy.buildScope({}, reads)))
        expect(textProblems(text, { sentence: key !== "amongAll" }), key).toEqual([]);
  });
});

describe("the missing-input sentences of a school that lacks a reading", () => {
  const { schools, P } = view("benchmark");
  const s17 = schools.find((s) => s.name === "Sample School 17") as copy.CopySchool;

  it("cannot be asked for without the rule", () => {
    // @ts-expect-error the rule is required
    const withoutRule = () => P.missingSentence(s17);
    // @ts-expect-error the rule is required
    const manyWithoutRule = () => P.missingSentences(s17);
    expect(withoutRule).toThrow(/rule/);
    expect(manyWithoutRule).toThrow(/rule/);
  });

  it("say the rule's inputs are recorded and name the reading it does not read", () => {
    expect(P.missingSentence(s17, "benchmark")).toBe(
      "All of the inputs this rule uses are recorded. Its air-quality reading, an air-pollution index for its location, is missing, but this rule does not use it."
    );
  });
});
