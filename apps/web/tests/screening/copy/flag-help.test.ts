/**
 * The help for the persistence flag says how many schools have it only when the data says so, and says it for the
 * rule whose test it is.
 *
 * Failure modes, each with the test that catches it:
 *  1. A list carries no persistence block and no flag on any row, so the flag was read as false for every school,
 *     the count came out 0, and the help fell back to "Some schools have the flag." for a count nobody gave.
 *  2. A true zero reads like the unknown case, or states a school that does not exist.
 *  3. One rule's count is said under the other rule, or under a rule the test did not run for, or the help of one
 *     rule's experiment is worded as the other's.
 * The lists are the API's own saved responses, with the persistence keys taken off a list or its flags set from what
 * a test says (the saved ones hold the circulated rule's only).
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
const revised = fixtureResults("additive_no_u");
const others = RULES.filter((r) => r !== "additive_u" && r !== "additive_no_u").map((r) => fixtureResults(r));
const inputs = fixtureInputs();
const bound = (list: ReturnType<typeof circulated>, view: "additive_u" | "additive_no_u" = "additive_u") =>
  bindCopy({ view, inputs, lists: [list, revised, ...others] });
const help = (list: ReturnType<typeof circulated>) =>
  bound(list).copy.termsFor("additive_u").persistent_flag.help;

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
    const schools = schoolsFromLists(inputs, [bare, revised, ...others], "additive_u");
    expect(countsFromResults(bare, schools)).not.toHaveProperty("flagged");
  });

  it("states no number of schools with the flag, and does not say some have it", () => {
    expect(help(bare)).not.toMatch(/the flag\.$/);
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

describe("each rule's help", () => {
  const view = (rule: "additive_u" | "additive_no_u") => bound(fixtureResults("additive_u"), rule).copy;

  it("states the count of the rule shown, from that rule's own flags", () => {
    const flaggedS0 = revised.rows.filter((r) => r.persistent_candidate === true).length;
    expect(flaggedS0).toBe(4);
    expect(view("additive_no_u").termsFor("additive_no_u").persistent_flag.help).toMatch(
      / Four schools have the flag\.$/
    );
    expect(view("additive_no_u").counts.flagged).toBe(4);
    const flaggedS = fixtureResults("additive_u").rows.filter((r) => r.persistent_candidate === true).length;
    expect(view("additive_u").counts.flagged).toBe(flaggedS);
  });

  it("states each rule's own count when both lists are loaded, and none for a rule whose list is not", () => {
    const both = view("additive_no_u");
    expect(both.termsFor("additive_no_u").persistent_flag.help).toMatch(/ Four schools have the flag\.$/);
    expect(both.termsFor("additive_u").persistent_flag.help).toMatch(
      / (One|Two|Three|Four|Five) schools? (has|have) the flag\.$/
    );
    // The shown rule's list alone: the other rule's flags are unknown, so its help claims no count.
    const alone = bindCopy({ view: "additive_no_u", inputs, lists: [revised, ...others] }).copy;
    expect(alone.termsFor("additive_no_u").persistent_flag.help).toMatch(/ Four schools have the flag\.$/);
    expect(alone.termsFor("additive_u").persistent_flag.help).not.toMatch(/the flag\.$/);
  });

  it("states no count for a rule the test did not run for", () => {
    const copy = view("additive_no_u");
    for (const r of RULES)
      if (r !== "additive_u" && r !== "additive_no_u")
        expect(copy.termsFor(r).persistent_flag.help, r).not.toMatch(/ the flag\.$/);
  });

  it("words each rule's experiment as its own, and the unbound help as both", () => {
    const copy = view("additive_no_u");
    expect(copy.termsFor("additive_no_u").persistent_flag.help).toMatch(
      /fresh run for this rule and not a measure of what the urgency rating changes/
    );
    expect(copy.termsFor("additive_u").persistent_flag.help).toMatch(
      /circulated paper's experiment, which included urgency\. It is not a result for the rule without urgency/
    );
    expect(copy.TERMS.persistent_flag.help).toMatch(/each as its own experiment/);
    expect(copy.TERMS.persistent_flag.help).not.toMatch(/the flag\.$/);
    for (const t of [
      copy.termsFor("additive_no_u").persistent_flag.help,
      copy.termsFor("additive_u").persistent_flag.help,
      copy.TERMS.persistent_flag.help,
    ])
      expect(t).not.toMatch(/proposed|has not been redone|paper's main rule only/i);
  });
});
