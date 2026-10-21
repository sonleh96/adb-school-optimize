/**
 * The help for the persistence flag says how many schools have it only when the data says so.
 *
 * Failure modes, each with the test that catches it:
 *  1. The circulated list carries no persistence block and no flag on any row, so the flag was read as false for
 *     every school, the count came out 0, and the help fell back to "Some schools have the flag." for a count
 *     nobody gave.
 *  2. A true zero reads like the unknown case, or states a school that does not exist.
 * The lists are the API's own saved responses, with the persistence keys taken off the circulated one or all of its
 * flags set false, which is what the API sends when no school is flagged.
 */
import { describe, expect, it } from "vitest";

import { bindCopy, countsFromResults, schoolsFromLists } from "@/lib/screening/copy";
import { parseWith } from "@/lib/screening/schema";
import { resultsResponse } from "@/lib/screening/types";

import { copy as clone, readFixture } from "../fixtures";
import { RULES, fixtureInputs, fixtureResults } from "./helpers";

type Body = { persistence?: unknown; rows: Record<string, unknown>[] };
const circulated = (change: (b: Body) => void) => {
  const b = clone(readFixture("results/additive_u.json")) as Body;
  change(b);
  return parseWith(resultsResponse, b, "results/additive_u");
};
const others = RULES.filter((r) => r !== "additive_u").map((r) => fixtureResults(r));
const inputs = fixtureInputs();
const help = (list: ReturnType<typeof circulated>) =>
  bindCopy({ view: "additive_u", inputs, lists: [list, ...others] }).copy.TERMS.persistent_flag.help;

describe("a circulated list with no persistence block", () => {
  const bare = circulated((b) => {
    b.persistence = null;
    for (const row of b.rows) {
      delete row.persistent_candidate;
      delete row.lowest_top20_frequency;
      delete row.threshold_adjacent;
    }
  });

  it("gives no count of flagged schools", () => {
    const schools = schoolsFromLists(inputs, [bare, ...others], "additive_u");
    expect(countsFromResults(bare, schools)).not.toHaveProperty("flagged");
  });

  it("states no number of schools with the flag, and does not say some have it", () => {
    expect(help(bare)).not.toMatch(/the flag\./);
    expect(help(bare)).toMatch(/combined-factors rule with urgency \(S\)\.$/);
  });
});

describe("a circulated list where the test flagged no school", () => {
  const none = circulated((b) => {
    for (const row of b.rows) if (row.persistent_candidate === true) row.persistent_candidate = false;
    for (const row of b.rows) if (row.threshold_adjacent === true) row.threshold_adjacent = false;
  });

  it("says that no school has the flag", () => {
    expect(help(none)).toMatch(/ No school has the flag\.$/);
  });
});

describe("a circulated list that flags schools", () => {
  it("states how many have the flag", () => {
    expect(help(fixtureResults("additive_u"))).toMatch(
      / (One|Two|Three|Four|Five) schools? (has|have) the flag\.$/
    );
  });
});
