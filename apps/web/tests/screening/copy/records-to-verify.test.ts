/**
 * The records to verify, as the paper describes them (publication follow-up of 2026-10-29): a record waits when a
 * detail school need is built from is missing, or when it gives 0 classrooms in total, which needs checking but is
 * not a blank. Failure modes:
 *  1. The tab or its sentences call every record missing information, though some give 0 classrooms and miss nothing.
 *  2. The groups are counted from a constant, from another rule's list, or do not add up to the records on the tab.
 *  3. A school that gives 0 classrooms is told, on its own, that information about it is missing.
 *  4. A term's words call the records to verify incomplete records, though some are complete and give 0 classrooms.
 *  5. The tab names these schools one way and the map key and the guide another, so a reader does not connect them.
 *  6. The line that counts what the find control leaves on that tab calls them by another name than the tab's, or
 *     reads as a double negative when none is left.
 * The datasets are the API's own saved responses: the default one, and the one with a record for each reason the
 * engine can hold a school for.
 */
import { describe, expect, it } from "vitest";

import * as copy from "@/lib/screening/copy";
import { GUIDE } from "@/lib/screening/copy/later";
import { parseWith } from "@/lib/screening/schema";
import { inputsResponse, resultsResponse } from "@/lib/screening/types";

import { type Dataset, readFixture } from "../fixtures";

const bound = (dataset: Dataset, rule: copy.CopyRuleId) => {
  const read = (file: string) => readFixture(file, dataset);
  const list = (id: string) => parseWith(resultsResponse, read(`results/${id}.json`), id);
  return copy.bindCopy({
    view: rule,
    inputs: parseWith(inputsResponse, read("inputs.json"), "inputs"),
    lists: [list(rule), list("additive_u"), list("additive_no_u")],
  });
};

describe("the records to verify", () => {
  it("are not called missing information (1)", () => {
    const { copy: P } = bound("", "additive_no_u");
    for (const text of [
      P.LAYOUT.incompleteTab,
      P.LAYOUT.legendIncomplete,
      P.TERMS.queue.label,
      P.TERMS.queue.line,
      P.IDEAS.queue.title,
      P.IDEAS.queue.short,
      P.STRINGS.queueIntro,
    ])
      expect(text, text).not.toMatch(/missing information|information (about them|about it) is missing/i);
  });

  it("are named on their tab as the map key and the guide name them, and the lead says why (5)", () => {
    const { copy: P } = bound("", "additive_no_u");
    const step = GUIDE.tasks.find((task) => task.id === "q4")!;
    expect(P.LAYOUT.incompleteTab).toBe(P.LAYOUT.keyRing);
    expect(P.termsFor("additive_no_u").queue.label).toBe(`${P.LAYOUT.keyRing} (${P.counts.queue})`);
    expect(step.title.toLowerCase()).toContain(P.LAYOUT.keyRing.toLowerCase());
    expect(step.steps[0].onScreen).toContain(`"${P.LAYOUT.incompleteTab}" tab`);
    // Inside the tab, the lead says they are records to verify before they can be put in order.
    expect(P.IDEAS.queue.short).toMatch(/not in the list yet because their records need verifying first\./);
  });

  it("are counted on their tab by the tab's own name when the find control holds a place (6)", () => {
    const { LAYOUT } = copy;
    const highlands = { province: "Highlands", district: null, name: null };
    const tabName = LAYOUT.incompleteTab.toLowerCase();
    expect(LAYOUT.findShowing(2, 13, "queue", highlands)).toBe(
      `2 of the 13 schools ${tabName} are in Highlands.`
    );
    expect(LAYOUT.findShowing(1, 1, "queue", highlands)).toBe(`The one school ${tabName} is in Highlands.`);
    expect(LAYOUT.findShowing(0, 13, "queue", highlands)).toBe(
      `None of the 13 schools ${tabName} is in Highlands.`
    );
  });

  it("say how many have a detail missing and how many give 0 classrooms, from the list on screen (2)", () => {
    // One record for each reason the engine holds a school for: a missing count, a negative count, 0 classrooms, an
    // unusable power source, an unknown remoteness, a district figure, walking reach. Urgency is not read here.
    expect(bound("ties-and-ranges", "additive_no_u").copy.STRINGS.queueGroups).toBe(
      "1 has a detail missing. 1 records 0 classrooms in total, which needs checking. 5 need checking for another reason, which each entry names."
    );
    // Two records lack a teacher count, and one gives a remoteness category the engine cannot read.
    expect(bound("", "additive_no_u").copy.STRINGS.queueGroups).toBe(
      "2 have a detail missing. 1 needs checking for another reason, which its entry names."
    );
  });

  it("are counted from the rule on screen: the rule that reads urgency holds more records (2)", () => {
    const withUrgency = bound("ties-and-ranges", "additive_u").copy;
    expect(withUrgency.counts.queue).toBe(8);
    expect(withUrgency.STRINGS.queueGroups).toBe(
      "1 has a detail missing. 1 records 0 classrooms in total, which needs checking. 6 need checking for another reason, which each entry names."
    );
  });

  it("tell a school with 0 classrooms what to verify, not that information about it is missing (3)", () => {
    const { copy: P, schools } = bound("ties-and-ranges", "additive_no_u");
    const zero = schools.find((s) => s.name === "Queue Zero Denominator")!;
    const missing = schools.find((s) => s.name === "Queue Missing Stock")!;
    expect(P.placeContext(zero, "additive_no_u")).toBe(
      "Its record gives 0 classrooms in total, which needs checking, so it is not in the list until someone verifies it. That says nothing about its need."
    );
    expect(P.placeContext(missing, "additive_no_u")).toMatch(/^Information about it is missing/);
  });

  it("are never called incomplete records in any term, with or without counts (4)", () => {
    // Every count a term's words can name, so each sentence that only shows with a count is read too.
    const counted = copy.buildTerms({
      all: 9,
      complete: 4,
      range: 1,
      ranked: 5,
      queue: 4,
      remotenessOnly: 1,
    });
    for (const terms of [copy.TERMS, counted])
      for (const [key, term] of Object.entries(terms))
        for (const text of [term.label, term.line, term.help])
          expect(text, `${key}: ${text}`).not.toMatch(/\bincomplete records?\b/i);
  });
});
