/**
 * One school under two rules, from the API's own saved responses.
 *
 * Failure modes, each with the test that catches it:
 *  1. A school held back under the rule shown loses its results under the other rules, so a sentence says it
 *     "cannot be put in order under any rule" when the other rules put it in order.
 *  2. Both places are said against the group of the rule shown, though the groups differ between rules (16, 17 and
 *     21 schools with every input recorded in the saved responses).
 *  3. The worked example in How this works compares two possible places against one group.
 */
import { describe, expect, it } from "vitest";

import * as copy from "@/lib/screening/copy";
import {
  countsByRuleFromResults,
  countsFromResults,
  pairwiseFromCompare,
  placedFromResults,
  schoolFromDetail,
  wireSchoolDetail,
} from "@/lib/screening/copy";
import { parseWith } from "@/lib/screening/schema";

import { copy as clone, readFixture } from "../fixtures";
import { KEYS, fixtureCompare, fixtureDetail, fixtureResults, textProblems } from "./helpers";

const S = "the combined-factors rule with urgency (S)";
const S0 = "the combined-factors rule without urgency (S0)";
const B = "the conventional benchmark (B)";

const lists = {
  additive_u: fixtureResults("additive_u"),
  additive_no_u: fixtureResults("additive_no_u"),
  benchmark: fixtureResults("benchmark"),
};
const byRule = countsByRuleFromResults(lists.additive_u, lists.additive_no_u, lists.benchmark);

describe("the group of each rule", () => {
  it("is counted from that rule's own run", () => {
    expect(byRule.additive_u).toMatchObject({ complete: 16, ranked: 21 });
    expect(byRule.additive_no_u).toMatchObject({ complete: 17 });
    expect(byRule.benchmark).toMatchObject({ complete: 21 });
  });
});

describe("a school held back under the rule shown, from the list route", () => {
  const placed = placedFromResults(lists.additive_u, lists.additive_no_u, lists.benchmark);
  const P = copy.copyFor({
    schools: placed,
    counts: countsFromResults(lists.additive_u),
    countsByRule: byRule,
  });
  // Sample School 23 lacks an urgency value, so the rules that read urgency hold it back.
  const s23 = placed.find((s) => s.name === "Sample School 23");

  it("keeps its results under the rules that put it in order", () => {
    expect(s23?.cohort).toBe("queue");
    expect(Object.keys(s23?.results ?? {}).sort()).toEqual(["additive_no_u"]);
  });

  it("is not said to be held back under every rule", () => {
    const place = s23?.results?.additive_no_u?.rank_complete120;
    expect(place).toBeGreaterThan(0);
    const text = P.rangeComparisonSentence(s23 as never, "additive_u", "additive_no_u");
    expect(text).toBe(
      `Under ${S0}, Sample School 23 is ${copy.ordinal(place as number)} among the 17 schools with every input recorded. It cannot be put in order under ${S} yet, because its record is incomplete.`
    );
    expect(text).not.toMatch(/any rule/);
    expect(textProblems(text)).toEqual([]);
  });

  it("is said to be held back under both when both rules hold it", () => {
    expect(P.rangeComparisonSentence(s23 as never, "additive_u", "benchmark")).toBe(
      `Sample School 23 cannot be put in order under ${S} or ${B} yet, because its record is incomplete.`
    );
  });
});

describe("a school held back under the rule shown, from the detail route", () => {
  const body = clone(readFixture(`schools/${KEYS.complete}.json`)) as {
    rules: { rule: { rule_id: string }; result: { cohort: string; gate_failures: string[] } }[];
  };
  for (const e of body.rules)
    if (["additive_u", "need_first_u", "bottleneck_u", "benchmark"].includes(e.rule.rule_id)) {
      e.result.cohort = "verification_queue";
      e.result.gate_failures = ["urgency_unknown"];
    }
  const s = schoolFromDetail(parseWith(wireSchoolDetail, body, "school"), "additive_u");

  it("keeps the results and recorded contributions of the rules that put it in order", () => {
    expect(s.cohort).toBe("queue");
    expect(Object.keys(s.results ?? {}).sort()).toEqual([
      "additive_no_u",
      "bottleneck_no_u",
      "need_first_no_u",
    ]);
    expect(Object.keys(s.contributions ?? {})).toEqual(["additive_no_u"]);
  });

  it("says where the other rule puts it", () => {
    const P = copy.copyFor({ counts: { complete: 16 }, countsByRule: { additive_no_u: { complete: 17 } } });
    expect(P.rangeComparisonSentence(s, "additive_u", "additive_no_u")).toBe(
      `Under ${S0}, Sample School 08 is 1st among the 17 schools with every input recorded. It cannot be put in order under ${S} yet, because its record is incomplete.`
    );
  });
});

describe("a complete school under two rules whose groups differ", () => {
  const s08 = placedFromResults(lists.additive_u, lists.additive_no_u, lists.benchmark).find(
    (s) => s.name === "Sample School 08"
  );
  const P = copy.copyFor({
    schools: [],
    counts: countsFromResults(lists.additive_u),
    countsByRule: byRule,
  });

  it("names the group of each rule, not the group of the rule shown", () => {
    expect(P.rangeComparisonSentence(s08 as never, "additive_u", "benchmark")).toBe(
      `Under ${S}, Sample School 08 is 1st among the 16 schools with every input recorded. Under ${B}, it is 4th among the 21 schools with every input recorded.`
    );
  });

  it("names the group of the rule a sentence is about when it is not the rule shown", () => {
    const sentence = P.rankSentence(s08 as never, "benchmark");
    expect(sentence).toMatch(/^4th of the 21 schools with every input recorded/);
  });

  it("without the groups of each rule says what it can: one group for both", () => {
    const shared = copy.copyFor({ counts: countsFromResults(lists.additive_u) });
    expect(shared.rangeComparisonSentence(s08 as never, "additive_u", "benchmark")).toMatch(
      /^Among the 16 schools with every input recorded, /
    );
  });
});

describe("the worked example in How this works", () => {
  const placed = placedFromResults(lists.additive_u, lists.additive_no_u);
  const data = { schools: placed, ...pairwiseFromCompare(fixtureCompare()) };
  const example = (countsByRule: copy.CountsByRule | undefined) =>
    copy
      .copyFor({ ...data, counts: countsFromResults(lists.additive_u), countsByRule })
      .HOW_IT_WORKS.find((x) => x.key === "limits")
      ?.sentences.find((t) => t.startsWith("For example"));

  it("names the group of each rule when they differ", () => {
    const text = example(byRule) as string;
    expect(text).toContain(
      "possible places among all the schools that can be put in order under each rule move from"
    );
    expect(textProblems(text)).toEqual([]);
  });

  it("names one group when they do not", () => {
    const same = example({ additive_u: byRule.additive_u, additive_no_u: byRule.additive_u }) as string;
    expect(same).toContain("possible places among all 21 schools that can be put in order move from");
  });
});

describe("the saved detail of a school", () => {
  it("still reads a range school's range and the benchmark's single place in the group both count", () => {
    const shown = schoolFromDetail(fixtureDetail(KEYS.interval), "additive_u");
    const P = copy.copyFor({ counts: countsFromResults(lists.additive_u), countsByRule: byRule });
    expect(P.rangeComparisonSentence(shown, "additive_u", "benchmark")).toBe(
      `Among the 21 schools that can be put in order, Sample School 17 sits anywhere from 11th to 18th under ${S}, and 12th under ${B}.`
    );
    // Under the rule that leaves urgency out the group has one more school, so each group is named.
    expect(P.rangeComparisonSentence(shown, "additive_u", "additive_no_u")).toBe(
      `Under ${S}, Sample School 17 could be anywhere from 11th to 18th among the 21 schools that can be put in order. Under ${S0}, it could be anywhere from 10th to 17th among the 22 schools that can be put in order.`
    );
  });
});
