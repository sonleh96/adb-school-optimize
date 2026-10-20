/**
 * A range school's score range is the engine's own.
 *
 * Failure modes, each with the test that catches it:
 *  1. The page adds up the contributions to make the range, so a rule whose score is more than their sum (the
 *     largest-factor rules) shows no range, and a sum that is a rounding error off shows a number the engine never
 *     stated.
 *  2. The adapter drops the bounds for some rule, so the card has nothing to show for it.
 * The records are the API's own saved response for a school that shows a range (Sample School 17), and the same
 * with one contribution changed so that the contributions no longer add up to the stored score.
 */
import { describe, expect, it } from "vitest";

import { RULE_IDS, schoolFromDetail } from "@/lib/screening/copy";
import { parseWith } from "@/lib/screening/schema";
import { schoolDetailResponse } from "@/lib/screening/types";
import { scoreRangeOf } from "@/lib/screening/workspace/score";

import { copy as clone, readFixture } from "./fixtures";
import { KEYS } from "./copy/helpers";

type Entry = {
  rule: { rule_id: string };
  result: { scores: { lower: number; upper: number }; contributions: { lower: number; upper: number }[] };
};
const raw = () => clone(readFixture(`schools/${KEYS.interval}.json`)) as { rules: Entry[] };
const engine = (id: string) => raw().rules.find((e) => e.rule.rule_id === id)!.result.scores;

describe("the bounds the adapter keeps", () => {
  const school = schoolFromDetail(parseWith(schoolDetailResponse, raw(), "school"), "additive_u");

  it.each(RULE_IDS)("are the engine's lower and upper score under %s", (id) => {
    const result = school.results?.[id];
    expect(result?.score_lower).toBe(engine(id).lower);
    expect(result?.score_upper).toBe(engine(id).upper);
  });
});

describe("the range the card shows", () => {
  it("is the engine's own, where the contributions add up to it", () => {
    const school = schoolFromDetail(parseWith(schoolDetailResponse, raw(), "school"), "additive_u");
    expect(scoreRangeOf(school.results?.additive_u)).toEqual([
      engine("additive_u").lower,
      engine("additive_u").upper,
    ]);
  });

  it("is the engine's own, where the contributions do not add up to the score", () => {
    // The largest-factor rule adds a share that is not among the contributions: they sum to 0.30, the score is 0.56.
    const body = raw();
    const bottleneck = body.rules.find((e) => e.rule.rule_id === "bottleneck_u")!.result;
    const sum = bottleneck.contributions.reduce((a, c) => a + c.lower, 0);
    expect(Math.abs(sum - bottleneck.scores.lower)).toBeGreaterThan(0.1);
    const school = schoolFromDetail(parseWith(schoolDetailResponse, body, "school"), "bottleneck_u");
    expect(scoreRangeOf(school.results?.bottleneck_u)).toEqual([
      bottleneck.scores.lower,
      bottleneck.scores.upper,
    ]);
  });

  it("is the engine's own, where the contributions are a rounding error off", () => {
    const body = raw();
    const additive = body.rules.find((e) => e.rule.rule_id === "additive_u")!.result;
    additive.contributions[0].upper += 1e-6;
    const school = schoolFromDetail(parseWith(schoolDetailResponse, body, "school"), "additive_u");
    expect(scoreRangeOf(school.results?.additive_u)).toEqual([additive.scores.lower, additive.scores.upper]);
  });

  it("is none when the engine states no bounds", () => {
    expect(scoreRangeOf(undefined)).toBeNull();
    expect(scoreRangeOf({ score_lower: 0.4, score_upper: null })).toBeNull();
    expect(scoreRangeOf({ score_lower: 0.6, score_upper: 0.5 })).toBeNull();
  });
});
