/**
 * The interface words added in round 6: the empty and failed states, the narrow layout, Copy link, the guide rail's
 * status lines and the landmarks. Failure modes, each with the test that catches it:
 *  1. A word is retyped in the page and drifts: the exact text is held here, once.
 *  2. A state blames the user or uses a banned word ("failed", "error"): the text guards run over each.
 *  3. A count is typed instead of taken from the data: the strings that state a count are checked with two sizes.
 *  4. "Legend" and "Key" both name the same thing on screen.
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import * as copy from "@/lib/screening/copy";
import { LAYOUT, TERMS } from "@/lib/screening/copy";
import { GUIDE } from "@/lib/screening/copy/later";

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
  it("names the menu and the key by one visible word each, which the key's toggle keeps open or closed", () => {
    expect([LAYOUT.menu, LAYOUT.keyLabel]).toEqual(["Menu", "Key"]);
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
    expect(GUIDE.stepCount(4)).toBe("4-step guide");
    expect(GUIDE.stepCount(1)).toBe("1-step guide");
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
      "Top of the list under the main method",
      "With and without the urgency rating",
      "A school with a range of ranks",
      "Schools with missing information",
    ]);
    expect(v.queue.onScreen(LAYOUT.incompleteTab)).toBe(
      'The "Missing information" tab, grouped by what is missing'
    );
    // A name a user may save is at most 60 characters, and the seeds fit.
    for (const n of Object.values(v).map((x) => x.name)) expect(n.length).toBeLessThanOrEqual(60);
  });

  it("fills a step title's place slot with a range or a single rank", () => {
    expect(GUIDE.rangeWords(5, 6)).toBe("anywhere from 5th to 6th");
    expect(GUIDE.rangeWords(5, 5)).toBe("5th");
  });
});

describe("the words that join values", () => {
  it("say a place, a range of values, a rank and a saved view in one way", () => {
    expect(LAYOUT.placeRange("3rd", "12th")).toBe("3rd to 12th");
    expect(LAYOUT.valueRange("0.487", "0.537")).toBe("0.487 to 0.537");
    expect(LAYOUT.positionOf(3, 20)).toBe("3 of 20");
    expect(LAYOUT.underRule("Rank in the list", "the combined-factors rule with urgency (S)")).toBe(
      "Rank in the list under the combined-factors rule with urgency (S)"
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
  it("leave out the note that said a rule was only run on some schools, which the engine does not do", () => {
    expect(copy.buildStrings({ complete: 16 })).not.toHaveProperty("notComputedNote");
    expect(copy.STRINGS).not.toHaveProperty("notComputedNote");
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

describe("the order of the incomplete records", () => {
  it("is said for the grouping the list is in, and neither sentence claims the other's order", () => {
    for (const t of [copy.STRINGS.queueOrder, copy.STRINGS.queueOrderMissing])
      expect(textProblems(t), t).toEqual([]);
    expect(copy.STRINGS.queueOrder).not.toMatch(/largest|what is missing/);
    expect(copy.STRINGS.queueOrderMissing).toMatch(/what is missing/);
  });
});

describe("the workspace's words for the map, a stale list and an ended session", () => {
  it("come from the copy system, in sentences that pass the writing guards, and need no interim file", () => {
    for (const t of [
      LAYOUT.mapKeyboard,
      LAYOUT.basemapUnavailable,
      LAYOUT.refreshFailed,
      LAYOUT.sessionEnded,
    ])
      expect(textProblems(t), t).toEqual([]);
    expect(textProblems(LAYOUT.signIn, { sentence: false })).toEqual([]);
    expect(textProblems(LAYOUT.signOut, { sentence: false })).toEqual([]);
    expect(existsSync(path.resolve(__dirname, "../../../components/screening/copy.ts"))).toBe(false);
  });
});

describe("a saved view that names what the data no longer has", () => {
  const KEYS = ["rule", "compare", "school", "hover", "prov", "loc"];
  // Every non-empty set of the keys a view's stored state can name, in the screen's own order.
  const SETS = Array.from({ length: 2 ** KEYS.length - 1 }, (_, i) =>
    KEYS.filter((_k, j) => (i + 1) & (1 << j))
  );

  it("says one clean sentence for any set, in plain words with no key, id or rule letter", () => {
    for (const keys of SETS) {
      const text = LAYOUT.viewPartMissing(keys);
      expect(textProblems(text), keys.join()).toEqual([]);
      expect(text, keys.join()).toMatch(
        /^Part of this view could not be reopened: .+, so the screen shows .+ instead\.$/
      );
      expect(text, keys.join()).not.toMatch(/\b(prov|loc|hover|compare)\b|_|\b[A-Z]\d?\b/);
    }
  });

  it("names the school once whether it was selected or only pointed at, and agrees is with are", () => {
    expect(LAYOUT.viewPartMissing(["school", "hover"])).toBe(
      "Part of this view could not be reopened: the school is no longer in the data, so the screen shows no school selected instead."
    );
    expect(LAYOUT.viewPartMissing(["rule", "school"])).toContain(
      "the rule and the school are no longer in the data"
    );
  });

  it("refuses a key it has no words for rather than showing it", () => {
    expect(() => LAYOUT.viewPartMissing(["place"])).toThrow("No words for a saved view's place");
  });

  it("tells a person with a full list what to do", () => {
    expect(LAYOUT.viewsFull(50)).toBe(
      "The list holds 50 saved views, the most you can keep. Remove a view first to save another."
    );
    expect(textProblems(LAYOUT.viewsFull(50))).toEqual([]);
  });
});

describe("a saved view's stored range placement", () => {
  it("is said to still apply when it is not the default, in the same one sentence", () => {
    const text = LAYOUT.viewPartMissing(["rule", "school"], "upper");
    expect(text).toBe(
      "Part of this view could not be reopened: the rule and the school are no longer in the data, so the screen shows the paper's main rule and no school selected instead, and the order it saved for the schools that show a range still applies."
    );
    expect(textProblems(text)).toEqual([]);
    expect(text.match(/\./g)).toHaveLength(1);
  });

  it("says nothing of it for the default placement or none", () => {
    for (const placement of [undefined, null, "lower"])
      expect(LAYOUT.viewPartMissing(["school"], placement)).toBe(LAYOUT.viewPartMissing(["school"]));
    expect(LAYOUT.viewPartMissing(["school"])).not.toMatch(/still applies/);
  });
});

describe("the rows of a school card's numbers", () => {
  it("name a part by what it adds, so a part's own value and its contribution never share a label", () => {
    expect(LAYOUT.partAdds("Classrooms not of permanent materials")).toBe(
      "Of that, classrooms not of permanent materials"
    );
    expect(LAYOUT.partAdds("Remoteness")).not.toBe(TERMS.need_locality.label);
    expect(textProblems(LAYOUT.partAdds("Remoteness"), { sentence: false })).toEqual([]);
  });
});
