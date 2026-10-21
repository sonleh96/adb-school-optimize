/**
 * What the copy says about the paper's persistence test. The numbers come from the API: whether a school stayed in
 * the top 20, whether it is only just above the line, and the margin that means (the test's standard error times the
 * number of standard errors its band spans). The test was run for two rules, each its own experiment: the revised
 * paper's rule without urgency (a fresh six-component run, a band of two standard errors) and the circulated paper's
 * rule with urgency (a band of one).
 *
 * Failure modes, each with the test that catches it:
 *  1. A rule's flag is said under another rule, or one rule's experiment is worded as the other's: the circulated
 *     count read as an urgency-omitted result, or the fresh run read as an isolated estimate of what urgency changes.
 *  2. A school that is not flagged is told it is near the line, or a flagged one is not told when it is; a school the
 *     data does not call adjacent under a rule is told it is, because it is adjacent under the other.
 *  3. The sentence states a number the data does not give, or loses the paper's limitation, or states a margin of one
 *     standard error for a test whose band is two.
 *  4. The margin comes from a list that is not the flagged rule's own.
 *  5. The flag of a rule whose list carries no flags reads as false instead of unknown.
 * The lists are the API's own saved responses, which hold each rule's invented test. In them the circulated test
 * flags Sample Schools 01, 02 and 06 (02 and 06 within one standard error of the line); the revised one flags 01, 02,
 * 03 and 06 (06 within two standard errors).
 */
import { describe, expect, it } from "vitest";

import * as copy from "@/lib/screening/copy";
import {
  marginFromResults,
  schoolFromDetail,
  schoolsFromLists,
  standardErrorFromResults,
} from "@/lib/screening/copy";
import { parseWith } from "@/lib/screening/schema";
import { schoolDetailResponse } from "@/lib/screening/types";

import { copy as clone, readFixture } from "../fixtures";
import { KEYS, RULES, fixtureInputs, fixtureResults, listWithFlags, textProblems } from "./helpers";

const inputs = fixtureInputs();
const S = "additive_u";
const S0 = "additive_no_u";
const circulated = fixtureResults(S);
const revised = fixtureResults(S0);
const lists = RULES.map((r) => fixtureResults(r));
const byName = (n: string, view: copy.CopyRuleId = S) =>
  schoolsFromLists(inputs, lists, view).find((s) => s.name === n);
const bound = copy.bindCopy({ view: S, inputs, lists }).copy;

const near = (points: string) =>
  `In that test it stayed in the top 20 only just often enough to be flagged, within ${points} percentage points of the line, so another round of random changes to the shares could take the flag away.`;
const NEAR_WITH = near("0.6");
const NEAR_WITHOUT =
  "In that test it stayed in the top 20 only just often enough to be flagged, so another round of random changes to the shares could take the flag away.";
const FLAG = copy.STRINGS.persistentFlag;

describe("the margin of the persistence test", () => {
  it("is the standard error times the band of the list of the rule the test ran for", () => {
    const se = 0.005656854249492379;
    expect(standardErrorFromResults(circulated)).toBeCloseTo(se, 12);
    expect(standardErrorFromResults(revised)).toBeCloseTo(se, 12);
    expect(marginFromResults(circulated)).toBeCloseTo(se, 12);
    expect(marginFromResults(revised)).toBeCloseTo(2 * se, 12);
  });

  it("reads a block that names no band as one standard error, and no block as none", () => {
    expect(marginFromResults(listWithFlags(S0, {}, 0.004))).toBe(0.004);
    expect(marginFromResults(listWithFlags(S0, {}, null))).toBeUndefined();
  });

  it("is read from the list of no other rule", () => {
    for (const l of lists)
      if (l.run.rule_id !== S && l.run.rule_id !== S0) {
        expect(standardErrorFromResults(l), l.run.rule_id).toBeUndefined();
        expect(marginFromResults(l), l.run.rule_id).toBeUndefined();
      }
  });

  it("is each rule's own when the copy is bound to the lists", () => {
    const say = (n: string, view: copy.CopyRuleId) => bound.persistenceNote(byName(n, view)!, view);
    expect(say("Sample School 02", S)[1]).toBe(NEAR_WITH);
    // The same school is flagged under the revised test too, but the data does not call it adjacent there.
    expect(say("Sample School 02", S0)).toEqual([FLAG[S0]]);
    // School 06 is adjacent under both; the revised test's band is two standard errors, so twice the margin.
    expect(say("Sample School 06", S)[1]).toBe(NEAR_WITH);
    expect(say("Sample School 06", S0)).toEqual([FLAG[S0], near("1.1")]);
  });
});

describe("the line a flagged school is near", () => {
  const se = 0.004;

  it.each([
    [S, 1],
    [S0, 2],
  ] as const)(
    "says %s's margin of %i standard error(s) for the school the API calls near the line, and only for it",
    (rule, band) => {
      // The API's flags, as it would send them under a block that names this rule's band: School 01 is near the
      // line, School 02 is flagged but not near it. The copy takes the flag as sent and states the rule's margin.
      const list = listWithFlags(
        rule,
        { "Sample School 01": { adjacent: true }, "Sample School 02": { adjacent: false } },
        se,
        band
      );
      const l = lists.map((x) => (x.run.rule_id === rule ? list : x));
      const b = copy.bindCopy({ view: rule, inputs, lists: l }).copy;
      const say = (n: string) =>
        b.persistenceNote(
          schoolsFromLists(inputs, l, rule).find((x) => x.name === n)!,
          rule
        );
      expect(marginFromResults(list)).toBeCloseTo(band * se, 12);
      expect(say("Sample School 01")).toEqual([
        FLAG[rule],
        near(String(Number((band * se * 100).toFixed(1)))),
      ]);
      expect(say("Sample School 02")).toEqual([FLAG[rule]]);
    }
  );
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

  it("states no number when the test's margin is not known", () => {
    const s = byName("Sample School 02");
    expect(copy.copyFor().persistenceNote(s!, S)).toEqual([FLAG[S], NEAR_WITHOUT]);
    expect(copy.STRINGS.persistentNearLine).toBe(NEAR_WITHOUT);
    expect(copy.persistenceNote(s!, S, { margin: 0 })[1]).toBe(NEAR_WITHOUT);
    expect(copy.persistenceNote(s!, S, { margin: 0.00001 })[1]).toBe(NEAR_WITHOUT);
  });

  it("is told nothing when it is not flagged, even if its frequency is close", () => {
    // Sample School 04 is flagged under neither test.
    const s = byName("Sample School 04");
    expect(s?.persistence?.[S]?.persistent).toBe(false);
    expect(bound.persistenceNote(s!, S)).toEqual([]);
  });
});

describe("a school of the revised rule's list", () => {
  it("is told the flag in the words of the fresh run, and near the line only where the data says so", () => {
    const s = byName("Sample School 03", S0);
    expect(s?.persistence?.[S0]).toEqual({ persistent: true, adjacent: false });
    expect(bound.persistenceNote(s!, S0)).toEqual([FLAG[S0]]);
    expect(byName("Sample School 06", S0)?.persistence?.[S0]).toEqual({ persistent: true, adjacent: true });
  });

  it("is told it is near the line by no school when the data says none is, as the revised paper finds", () => {
    const none = listWithFlags(S0, { "Sample School 01": {}, "Sample School 04": {} }, 0.004);
    const l = lists.map((x) => (x.run.rule_id === S0 ? none : x));
    const b = copy.bindCopy({ view: S0, inputs, lists: l }).copy;
    for (const s of schoolsFromLists(inputs, l, S0))
      expect(b.persistenceNote(s, S0).length, s.name as string).toBeLessThanOrEqual(1);
  });
});

describe("each rule's flag shows under its own rule only", () => {
  it("says nothing under the other rule, and nothing under a rule that had no test", () => {
    // 03 is flagged under the revised test only; 01 under both.
    const three = byName("Sample School 03")!;
    const one = byName("Sample School 01")!;
    expect(bound.persistenceNote(three, S)).toEqual([]);
    expect(bound.persistenceNote(three, S0)).toEqual([FLAG[S0]]);
    expect(bound.persistenceNote(one, S)).toEqual([FLAG[S]]);
    expect(bound.persistenceNote(one, S0)).toEqual([FLAG[S0]]);
    for (const r of RULES)
      if (r !== S && r !== S0)
        for (const s of [one, three]) expect(bound.persistenceNote(s, r), r).toEqual([]);
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
    expect(s?.persistence).toEqual({ [S0]: { persistent: true, adjacent: false } });
    expect(s?.persistence).not.toHaveProperty(S);
    expect(bound.persistenceNote(s!, S)).toEqual([]);
  });
});
