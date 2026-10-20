/**
 * Which inputs a rule reads decides what "every input recorded" can mean under it.
 *
 * Failure modes, each with the test that catches it:
 *  1. The benchmark reads no air-quality, emissions or land-cover figure, so a school with a missing reading is
 *     complete under it. The copy said all of that school's inputs are recorded, and that the benchmark's group of
 *     21 schools all have every input recorded, when five of them lack a reading.
 *  2. The rules that leave urgency out put a school with no urgency value in order. The copy said the same of it.
 *  3. A rule that reads every input is worded as before.
 * The records are the API's own saved lists.
 */
import { describe, expect, it } from "vitest";

import * as copy from "@/lib/screening/copy";
import {
  countsByRuleFromResults,
  countsFromResults,
  placedFromResults,
  schoolsFromLists,
} from "@/lib/screening/copy";

import { fixtureResults, fixtureInputs, textProblems } from "./helpers";

const lists = {
  additive_u: fixtureResults("additive_u"),
  additive_no_u: fixtureResults("additive_no_u"),
  benchmark: fixtureResults("benchmark"),
};
const byRule = countsByRuleFromResults(lists.additive_u, lists.additive_no_u, lists.benchmark);

/** The schools as the benchmark's list shows them. */
const underBenchmark = schoolsFromLists(
  fixtureInputs(),
  [lists.benchmark, lists.additive_u, lists.additive_no_u],
  "benchmark"
);
const underNoUrgency = schoolsFromLists(
  fixtureInputs(),
  [lists.additive_no_u, lists.additive_u],
  "additive_no_u"
);
const named = (schools: copy.PlacedSchool[], name: string) =>
  schools.find((s) => s.name === name) as copy.CopySchool;

describe("the group of schools with their inputs recorded", () => {
  const P = copy.copyFor({
    schools: placedFromResults(lists.additive_u, lists.additive_no_u, lists.benchmark),
    counts: countsFromResults(lists.additive_u),
    countsByRule: byRule,
  });

  it("is worded as before under a rule that reads every input", () => {
    expect(P.groupsSentence("additive_u")).toBe(
      "16 schools have every input recorded, and five more lack a reading such as air quality and show a range of places, so 21 schools can be put in order."
    );
  });

  it("is worded by the inputs the benchmark reads, which includes schools with a missing reading", () => {
    const text = P.groupsSentence("benchmark");
    expect(text).toBe(
      "21 schools have every input the rule reads recorded, so 21 schools can be put in order."
    );
    expect(textProblems(text)).toEqual([]);
  });

  it("is worded by the inputs a rule that leaves urgency out reads", () => {
    expect(P.groupsSentence("additive_no_u")).toMatch(
      /^17 schools have every input the rule reads recorded, and /
    );
  });

  it("says no number it was not given", () => {
    expect(copy.groupsSentence(undefined, { urgency: true, readings: false })).toBe(
      "Schools with every input the rule reads recorded have one place each, and can be put in order."
    );
  });
});

describe("a school with a missing reading, under the benchmark", () => {
  const P = copy.copyFor({
    schools: underBenchmark,
    counts: countsFromResults(lists.benchmark),
    countsByRule: byRule,
  });
  const s17 = named(underBenchmark, "Sample School 17");

  it("is complete under the benchmark and incomplete under the rule that reads the reading", () => {
    expect(s17.cohort).toBe("complete");
    expect(s17.missing_env.aqi).toBe(true);
  });

  it("does not have all of its inputs recorded, and still names the reading that is missing", () => {
    expect(P.missingSentences(s17, "benchmark")).toEqual([
      "All of the inputs this rule reads are recorded.",
      "Its air-quality reading, an air-pollution index for its location, is missing, but this rule does not read it.",
    ]);
    expect(P.missingSentence(s17, "benchmark")).not.toMatch(/all of its inputs/i);
  });

  it("is placed among the schools that have the benchmark's inputs, not every input", () => {
    const text = P.rankSentence(s17, "benchmark");
    expect(text).toMatch(/^12th of the 21 schools with every input the rule reads recorded/);
    expect(textProblems(text)).toEqual([]);
  });

  it("keeps the old words when no rule is given, or for a rule that reads every input", () => {
    const whole = named(placedFromResults(lists.additive_u, lists.benchmark), "Sample School 08");
    expect(P.missingSentences(whole, "additive_u")).toEqual(["All of its inputs are recorded."]);
    expect(P.missingSentences(whole, "additive_u")).toEqual(["All of its inputs are recorded."]);
  });
});

describe("a school with no urgency value, under a rule that leaves urgency out", () => {
  const P = copy.copyFor({
    schools: underNoUrgency,
    counts: countsFromResults(lists.additive_no_u),
    countsByRule: byRule,
  });
  const s23 = named(underNoUrgency, "Sample School 23");

  it("is complete there, and says its urgency value is not recorded but not needed", () => {
    expect(s23.cohort).toBe("complete");
    expect(P.missingSentences(s23, "additive_no_u")).toEqual([
      "All of the inputs this rule reads are recorded.",
      "Its urgency value is not recorded, but this rule does not use it.",
    ]);
  });
});
