/**
 * What the copy says about the paper's persistence test. The numbers come from the API: whether a school stayed in
 * the top 20, whether it is only just above the line, and the test's standard error. The test was run for two rules,
 * each its own experiment: the revised paper's rule without urgency (a fresh six-component run) and the circulated
 * paper's rule with urgency.
 *
 * Failure modes, each with the test that catches it:
 *  1. A rule's flag is said under another rule, or one rule's experiment is worded as the other's: the circulated
 *     count read as an urgency-omitted result, or the fresh run read as an isolated estimate of what urgency changes.
 *  2. A school that is not flagged is told it is near the line, or a flagged one is not told when it is; a rule whose
 *     data names no adjacent school is told one is.
 *  3. The sentence states a number the data does not give, or loses the paper's limitation.
 *  4. The margin comes from a list that is not the flagged rule's own.
 *  5. The flag of a rule whose list carries no flags reads as false instead of unknown.
 * The lists are the API's own saved responses; the saved ones hold the test for the circulated rule only, so the
 * revised rule's list is the saved one with the persistence keys set from what these tests say.
 */
import { describe, expect, it } from "vitest";

import * as copy from "@/lib/screening/copy";
import { schoolFromDetail, schoolsFromLists, standardErrorFromResults } from "@/lib/screening/copy";
import { parseWith } from "@/lib/screening/schema";
import { schoolDetailResponse } from "@/lib/screening/types";

import { copy as clone, readFixture } from "../fixtures";
import { KEYS, RULES, fixtureInputs, fixtureResults, listWithFlags, textProblems } from "./helpers";

const inputs = fixtureInputs();
const S = "additive_u";
const S0 = "additive_no_u";
// The circulated rule's saved flags: School 01 well above the line, 02 and 06 only just above, 03 not flagged.
const circulated = fixtureResults(S);
// The revised rule's, made for these tests: School 01 flagged under both, School 04 under this rule only, none adjacent.
const revised = listWithFlags(S0, { "Sample School 01": {}, "Sample School 04": {} }, 0.004);
const lists = RULES.map((r) => (r === S0 ? revised : fixtureResults(r)));
const byName = (n: string, view: copy.CopyRuleId = S) =>
  schoolsFromLists(inputs, lists, view).find((s) => s.name === n);
const bound = copy.bindCopy({ view: S, inputs, lists }).copy;

const NEAR_WITH =
  "In that test it stayed in the top 20 only just often enough to be flagged, within 0.6 percentage points of the line, so another round of random changes to the shares could take the flag away.";
const NEAR_WITHOUT =
  "In that test it stayed in the top 20 only just often enough to be flagged, so another round of random changes to the shares could take the flag away.";
const FLAG = copy.STRINGS.persistentFlag;

describe("the margin of the persistence test", () => {
  it("is the standard error of the provenance block of the list of the rule the test ran for", () => {
    expect(standardErrorFromResults(circulated)).toBeCloseTo(0.005656854249492379, 12);
    expect(standardErrorFromResults(revised)).toBe(0.004);
  });

  it("is read from the list of no other rule", () => {
    for (const l of lists)
      if (l.run.rule_id !== S && l.run.rule_id !== S0)
        expect(standardErrorFromResults(l), l.run.rule_id).toBeUndefined();
  });

  it("is each rule's own when the copy is bound to the lists", () => {
    const school = (n: string, view: copy.CopyRuleId) => bound.persistenceNote(byName(n, view)!, view);
    expect(school("Sample School 02", S)[1]).toBe(NEAR_WITH);
    // A margin that is not 0.6 points, from the revised rule's own block, on a school the data calls adjacent.
    const near = listWithFlags(S0, { "Sample School 04": { adjacent: true } }, 0.004);
    const b = copy.bindCopy({ view: S0, inputs, lists: [...lists.filter((l) => l !== revised), near] });
    const s = schoolsFromLists(inputs, [...lists.filter((l) => l !== revised), near], S0).find(
      (x) => x.name === "Sample School 04"
    );
    expect(b.copy.persistenceNote(s!, S0)[1]).toBe(NEAR_WITH.replace("0.6", "0.4"));
  });
});

describe("a school of the circulated list", () => {
  it("is told only the flag when it is flagged and well above the line", () => {
    const s = byName("Sample School 01");
    expect(s?.persistence?.[S]).toEqual({ persistent: true, adjacent: false });
    expect(bound.persistenceNote(s!, S)).toEqual([FLAG[S]]);
  });

  it("is also told it is only just above the line, with the margin the data gives", () => {
    for (const name of ["Sample School 02", "Sample School 06"]) {
      const s = byName(name);
      expect(s?.persistence?.[S]?.adjacent, name).toBe(true);
      expect(bound.persistenceNote(s!, S), name).toEqual([FLAG[S], NEAR_WITH]);
    }
  });

  it("states no number when the test's standard error is not known", () => {
    const s = byName("Sample School 02");
    expect(copy.copyFor().persistenceNote(s!, S)).toEqual([FLAG[S], NEAR_WITHOUT]);
    expect(copy.STRINGS.persistentNearLine).toBe(NEAR_WITHOUT);
    expect(copy.persistenceNote(s!, S, { standardError: 0 })[1]).toBe(NEAR_WITHOUT);
    expect(copy.persistenceNote(s!, S, { standardError: 0.00001 })[1]).toBe(NEAR_WITHOUT);
  });

  it("is told nothing when it is not flagged, even if its frequency is close", () => {
    // Sample School 03 reached 0.7999 of the 0.80 line, so it is not flagged and is not "just above" anything.
    const s = byName("Sample School 03");
    expect(s?.persistence?.[S]?.persistent).toBe(false);
    expect(bound.persistenceNote(s!, S)).toEqual([]);
  });
});

describe("a school of the revised rule's list", () => {
  it("is told the flag in the words of the fresh run, and never that it is near the line when the data says none is", () => {
    const s = byName("Sample School 04", S0);
    expect(s?.persistence?.[S0]).toEqual({ persistent: true, adjacent: false });
    expect(bound.persistenceNote(s!, S0)).toEqual([FLAG[S0]]);
    // Even the school that sits only just above the line under the circulated test is not told so under this one.
    expect(bound.persistenceNote(byName("Sample School 02", S0)!, S0)).toEqual([]);
  });

  it("is told it is near the line only where the data says so", () => {
    const near = listWithFlags(S0, { "Sample School 04": { adjacent: true }, "Sample School 01": {} }, 0.004);
    const l = lists.map((x) => (x === revised ? near : x));
    const [flag, line] = copy.bindCopy({ view: S0, inputs, lists: l }).copy.persistenceNote(
      schoolsFromLists(inputs, l, S0).find((x) => x.name === "Sample School 04")!,
      S0
    );
    expect(flag).toBe(FLAG[S0]);
    expect(line).toMatch(/within 0\.4 percentage points of the line/);
    const plain = copy.bindCopy({ view: S0, inputs, lists: l }).copy;
    expect(
      plain.persistenceNote(
        schoolsFromLists(inputs, l, S0).find((x) => x.name === "Sample School 01")!,
        S0
      )
    ).toEqual([FLAG[S0]]);
  });
});

describe("each rule's flag shows under its own rule only", () => {
  it("says nothing under the other rule, and nothing under a rule that had no test", () => {
    // 02 is flagged under the circulated test only; 04 under the revised one only; 01 under both.
    const two = byName("Sample School 02")!;
    const four = byName("Sample School 04")!;
    const one = byName("Sample School 01")!;
    expect(bound.persistenceNote(two, S0)).toEqual([]);
    expect(bound.persistenceNote(four, S)).toEqual([]);
    expect(bound.persistenceNote(one, S)).toEqual([FLAG[S]]);
    expect(bound.persistenceNote(one, S0)).toEqual([FLAG[S0]]);
    for (const r of RULES)
      if (r !== S && r !== S0)
        for (const s of [one, two, four]) expect(bound.persistenceNote(s, r), r).toEqual([]);
  });

  it("words the fresh run and the circulated experiment differently, and relabels neither", () => {
    expect(FLAG[S0]).toMatch(/fresh run for this rule, not a measure of what the urgency value changes/);
    expect(FLAG[S]).toMatch(/circulated/);
    expect(FLAG[S]).toMatch(/not a result for the rule without urgency/);
    expect(FLAG[S0]).not.toMatch(/circulated|proposed|redone/);
    expect(FLAG[S]).not.toMatch(/fresh|proposed|redone/);
    for (const t of [FLAG[S0], FLAG[S], NEAR_WITH, NEAR_WITHOUT]) expect(textProblems(t), t).toEqual([]);
  });

  it("is read from a school's own detail for each rule that has the keys", () => {
    const body = clone(readFixture(`schools/${KEYS.complete}.json`)) as {
      rules: { rule: { rule_id: string }; persistent_candidate?: boolean; threshold_adjacent?: boolean }[];
    };
    for (const e of body.rules) {
      if (e.rule.rule_id === S0) Object.assign(e, { persistent_candidate: true, threshold_adjacent: false });
      if (e.rule.rule_id === S) Object.assign(e, { persistent_candidate: false, threshold_adjacent: false });
    }
    const school = schoolFromDetail(parseWith(schoolDetailResponse, body, "school"), S0);
    expect(school.persistence).toEqual({
      [S0]: { persistent: true, adjacent: false },
      [S]: { persistent: false, adjacent: false },
    });
    expect(bound.persistenceNote(school, S0)).toEqual([FLAG[S0]]);
    expect(bound.persistenceNote(school, S)).toEqual([]);
  });
});

describe("a school of a list that carries no flags for a rule", () => {
  it("has no flag to say for that rule, because the flag is unknown there", () => {
    const without = lists.filter((l) => l.run.rule_id !== S);
    const s = schoolsFromLists(inputs, without, S0).find((x) => x.name === "Sample School 02");
    expect(s?.persistence).toEqual({ [S0]: { persistent: false, adjacent: false } });
    expect(s?.persistence).not.toHaveProperty(S);
    expect(bound.persistenceNote(s!, S)).toEqual([]);
  });
});
