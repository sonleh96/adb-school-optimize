/**
 * What the copy says about the paper's persistence test. The numbers come from the API: whether a school stayed in
 * the top 20, whether it is only just above the line, and the test's standard error.
 *
 * Failure modes, each with the test that catches it:
 *  1. The flag is said under a rule it does not describe (the test used the rule with urgency).
 *  2. A school that is not flagged is told it is near the line, or a flagged one is not told when it is.
 *  3. The sentence states a number the data does not give, or loses the paper's limitation.
 *  4. The margin comes from a list that is not the circulated rule's.
 */
import { describe, expect, it } from "vitest";

import * as copy from "@/lib/screening/copy";
import { schoolsFromLists, standardErrorFromResults } from "@/lib/screening/copy";
import { parseWith } from "@/lib/screening/schema";
import { inputsResponse } from "@/lib/screening/types";

import { readFixture } from "../fixtures";
import { RULES, fixtureResults, textProblems } from "./helpers";

const inputs = parseWith(inputsResponse, readFixture("inputs.json"), "inputs");
const lists = RULES.map((r) => fixtureResults(r));
const circulated = lists[RULES.indexOf("additive_u")];
const se = standardErrorFromResults(circulated);
const byName = (n: string) => schoolsFromLists(inputs, lists, "additive_u").find((s) => s.name === n);
const P = copy.copyFor({ standardError: se });

const NEAR_WITH =
  "In that test it stayed in the top 20 only just often enough to be flagged, within 0.6 percentage points of the line, so another round of random changes to the shares could take the flag away.";
const NEAR_WITHOUT =
  "In that test it stayed in the top 20 only just often enough to be flagged, so another round of random changes to the shares could take the flag away.";

describe("the margin of the persistence test", () => {
  it("is the standard error of the circulated list's provenance block", () => {
    expect(se).toBeCloseTo(0.005656854249492379, 12);
  });

  it("is read from no other rule's list", () => {
    for (const l of lists)
      if (l !== circulated) expect(standardErrorFromResults(l), l.run.rule_id).toBeUndefined();
  });
});

describe("a school of the circulated list", () => {
  it("is told only the flag when it is flagged and well above the line", () => {
    const s = byName("Sample School 01");
    expect(s?.persistent_candidate_circulated).toBe(true);
    expect(s?.threshold_adjacent_circulated).toBe(false);
    expect(P.persistenceNote(s as never, "additive_u")).toEqual([copy.STRINGS.persistentFlag]);
  });

  it("is also told it is only just above the line, with the margin the data gives", () => {
    for (const name of ["Sample School 02", "Sample School 06"]) {
      const s = byName(name);
      expect(s?.threshold_adjacent_circulated, name).toBe(true);
      expect(P.persistenceNote(s as never, "additive_u"), name).toEqual([
        copy.STRINGS.persistentFlag,
        NEAR_WITH,
      ]);
    }
  });

  it("states no number when the test's standard error is not known", () => {
    const s = byName("Sample School 02");
    expect(copy.copyFor().persistenceNote(s as never, "additive_u")).toEqual([
      copy.STRINGS.persistentFlag,
      NEAR_WITHOUT,
    ]);
    expect(copy.STRINGS.persistentNearLine).toBe(NEAR_WITHOUT);
    expect(copy.persistenceNote(s as never, "additive_u", { standardError: 0 })[1]).toBe(NEAR_WITHOUT);
    expect(copy.persistenceNote(s as never, "additive_u", { standardError: 0.00001 })[1]).toBe(NEAR_WITHOUT);
  });

  it("is told nothing when it is not flagged, even if its frequency is close", () => {
    // Sample School 03 reached 0.7999 of the 0.80 line, so it is not flagged and is not "just above" anything.
    const s = byName("Sample School 03");
    expect(s?.persistent_candidate_circulated).toBe(false);
    expect(P.persistenceNote(s as never, "additive_u")).toEqual([]);
  });

  it("is told nothing under a rule other than the circulated one", () => {
    const s = byName("Sample School 02");
    for (const r of RULES) if (r !== "additive_u") expect(P.persistenceNote(s as never, r), r).toEqual([]);
  });

  it("keeps the paper's limitation and reads clean", () => {
    const [flag, near] = P.persistenceNote(byName("Sample School 02") as never, "additive_u");
    expect(flag).toMatch(/has not been redone for the proposed revision\.$/);
    expect(flag).toMatch(/with urgency/);
    for (const t of [flag, near]) expect(textProblems(t), t).toEqual([]);
  });
});

describe("a school of a list without the circulated rule", () => {
  it("has no flag to say, because the flag is unknown there", () => {
    const without = lists.filter((l) => l !== circulated);
    const s = schoolsFromLists(inputs, without, "additive_no_u").find((x) => x.name === "Sample School 02");
    expect(s?.persistent_candidate_circulated).toBeUndefined();
    expect(P.persistenceNote(s as never, "additive_u")).toEqual([]);
  });
});
