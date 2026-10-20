/**
 * The interface words added in round 6: the empty and failed states, the narrow layout, Copy link, the guide rail's
 * status lines and the landmarks. Failure modes, each with the test that catches it:
 *  1. A word is retyped in the page and drifts: the exact text is held here, once.
 *  2. A state blames the user or uses a banned word ("failed", "error"): the text guards run over each.
 *  3. A count is typed instead of taken from the data: the strings that state a count are checked with two sizes.
 *  4. "Legend" and "Key" both name the same thing on screen.
 */
import { describe, expect, it } from "vitest";

import * as copy from "@/lib/screening/copy";
import { GUIDE, LAYOUT, TERMS } from "@/lib/screening/copy";

import { textProblems } from "./helpers";

describe("an empty or failed load", () => {
  it("is one sentence that says what happened and what to do, and an action named Retry", () => {
    expect(LAYOUT.emptyData).toBe("No schools came back, so there is nothing to show until you try again.");
    expect(LAYOUT.loadFailed).toBe(
      "Some of the information did not load, so there is nothing to show until you try again."
    );
    expect(LAYOUT.retry).toBe("Retry");
    expect(LAYOUT.retrying).toBe("Trying again");
    for (const t of [LAYOUT.emptyData, LAYOUT.loadFailed, LAYOUT.availableAfterLoad])
      expect(textProblems(t), t).toEqual([]);
    for (const t of [LAYOUT.emptyData, LAYOUT.loadFailed]) {
      expect(t.match(/[.?!]/g)).toHaveLength(1);
      expect(t).not.toMatch(/\b(fail|failed|error|invalid|unable|file|json|404|server|network)\b/i);
    }
  });
});

describe("the narrow layout and the key", () => {
  it("names the menu and the key disclosure in each state", () => {
    expect([LAYOUT.menu, LAYOUT.keyLabel, LAYOUT.keyShow, LAYOUT.keyHide]).toEqual([
      "Menu",
      "Key",
      "Show the map key",
      "Hide the map key",
    ]);
    // The accessible name contains the visible label.
    expect(LAYOUT.keyShow.toLowerCase()).toContain(LAYOUT.keyLabel.toLowerCase());
    expect(LAYOUT.keyHide.toLowerCase()).toContain(LAYOUT.keyLabel.toLowerCase());
  });

  it("calls the legend the key everywhere a user reads it", () => {
    expect(LAYOUT.legendAria).toBe("Map key");
    expect(GUIDE.tasks[0].steps[2].onScreen).toBe("The first school on the map, and the key");
    expect(GUIDE.tasks[2].steps[2].onScreen).toBe("The school on the map, and the key");
    for (const k of ["mark_dot", "mark_range", "mark_ring"] as const)
      expect(TERMS[k].where).toBe("Map and key");
  });
});

describe("copy link", () => {
  it("says it worked, or what to do instead", () => {
    expect(LAYOUT.copyLink).toBe("Copy link");
    expect(LAYOUT.linkCopied).toBe("Link to this screen copied");
    expect(LAYOUT.linkNotCopied).toBe(
      "The link did not copy. Copy the address from your browser's address bar instead."
    );
    expect(LAYOUT.copyNotDone).toBe("That did not copy. Select the text and copy it by hand.");
    for (const t of [LAYOUT.linkNotCopied, LAYOUT.copyNotDone]) expect(textProblems(t), t).toEqual([]);
  });
});

describe("the guide rail's status lines", () => {
  it("count steps and sections, in the singular for one", () => {
    expect(GUIDE.stepCount(4)).toBe("4 steps");
    expect(GUIDE.stepCount(1)).toBe("1 step");
    expect(GUIDE.howCount(6)).toBe("6 short sections on how the list is made");
    expect(GUIDE.howCount(1)).toBe("1 short section on how the list is made");
    expect(GUIDE.stepOf(2, 4)).toBe("Step 2 of 4");
    expect(GUIDE.seen).toBe("Seen");
    expect(GUIDE.seenCount(2, 5)).toBe("2 of 5 seen");
    expect(GUIDE.drift).toBe("The screen has moved on from this step.");
    expect(GUIDE.driftRestore).toBe("Show this step again");
  });

  it("names the saved views a meeting starts with, and where to look for each", () => {
    const v = GUIDE.seedViews;
    expect([v.top.name, v.urgency.name, v.range.name, v.queue.name]).toEqual([
      "Top of the list under the paper's main rule",
      "With and without urgency",
      "A school with possible places",
      "Schools with incomplete records",
    ]);
    expect(v.queue.onScreen(LAYOUT.incompleteTab)).toBe(
      'The "Incomplete records" tab, grouped by what is missing'
    );
    // A name a user may save is at most 60 characters, and the seeds fit.
    for (const n of Object.values(v).map((x) => x.name)) expect(n.length).toBeLessThanOrEqual(60);
  });

  it("fills a step title's place slot with a range or a single place", () => {
    expect(GUIDE.rangeWords(5, 6)).toBe("anywhere from 5th to 6th");
    expect(GUIDE.rangeWords(5, 5)).toBe("5th");
  });
});

describe("the words that join values", () => {
  it("say a place, a range of values, a position and a saved view in one way", () => {
    expect(LAYOUT.placeRange("3rd", "12th")).toBe("3rd to 12th");
    expect(LAYOUT.valueRange("0.487", "0.537")).toBe("0.487 to 0.537");
    expect(LAYOUT.positionOf(3, 20)).toBe("3 of 20");
    expect(LAYOUT.underRule("Place in the list", "the combined-factors rule with urgency (S)")).toBe(
      "Place in the list under the combined-factors rule with urgency (S)"
    );
    expect(LAYOUT.savedToast(3)).toBe("Saved as view 3");
    expect(LAYOUT.removeView("J")).toBe("Remove the saved view J");
    expect(LAYOUT.tooltipMissing("power source blank")).toBe("Missing: power source blank");
    expect(LAYOUT.afterDownloadList).toBe(
      "Downloaded the top list. The method record is in the first lines of the file."
    );
  });
});

describe("the strings that state a count", () => {
  it("take it from the data, and say it without a number when it is unknown", () => {
    expect(copy.buildStrings({ complete: 16 }).notComputedNote).toBe(
      "This rule was only run on the 16 schools with every input recorded, and these schools have a missing reading."
    );
    expect(copy.buildStrings({ complete: 36 }).notComputedNote).toContain("the 36 schools");
    expect(copy.STRINGS.notComputedNote).toBe(
      "This rule was only run on the schools with every input recorded, and these schools have a missing reading."
    );
  });

  it("number the first dots on the map only as far as there are schools", () => {
    expect(copy.buildTerms({ complete: 16 }).mark_dot.help).toBe(
      "Numbered dots are the first 10 under the chosen rule."
    );
    expect(copy.buildTerms({ complete: 6 }).mark_dot.help).toBe(
      "Numbered dots are the first 6 under the chosen rule."
    );
    expect(copy.buildTerms({ complete: 1 }).mark_dot.help).toBe(
      "The numbered dot is the first school under the chosen rule."
    );
    expect(copy.buildTerms({ complete: 0 }).mark_dot.help).toBe(
      "No dot is numbered, because no school has every input recorded."
    );
    expect(copy.TERMS.mark_dot.help).toBe("Numbered dots are the first 10 under the chosen rule.");
  });
});
