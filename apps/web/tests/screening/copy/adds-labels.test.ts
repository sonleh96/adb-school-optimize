/**
 * The card names what an input adds to the score differently from the input's own value.
 *
 * Failure mode: "School need 0.793" in the need box and "School need 0.476" in "What each input adds" are both
 * right, and read as a contradiction to someone who does not know that the second is a share of the screening
 * score. The rows of the table that give an input's share are named for what they are, so no label stands for two
 * numbers on the card.
 */
import { describe, expect, it } from "vitest";

import { LAYOUT, TERMS } from "@/lib/screening/copy";

import { textProblems } from "./helpers";

/** The inputs whose own value the card shows beside their share of the score. */
const INPUTS = [
  "school_need",
  "area_context",
  "urgency",
  "reach",
  "air_quality",
  "emissions",
  "land_cover",
] as const;

describe("a row of what each input adds", () => {
  it.each(INPUTS)("is not named as %s is, where the card shows that input's own value", (key) => {
    const own = TERMS[key].label;
    const share = LAYOUT.addedBy(own);
    expect(share).not.toBe(own);
    expect(share.toLowerCase()).toContain(own.toLowerCase());
    expect(textProblems(share, { sentence: false }), share).toEqual([]);
  });

  it("says whose share it is, in the house style", () => {
    expect(LAYOUT.addedBy(TERMS.school_need.label)).toBe("Added by school need");
    expect(LAYOUT.addedBy(TERMS.area_context.label)).toBe("Added by district context");
    expect(LAYOUT.addedBy(TERMS.reach.label)).toBe("Added by walking reach");
    expect(LAYOUT.addedBy(TERMS.emissions.label)).toBe("Added by nearby emissions");
  });

  it("never shares a label with the input itself, for any label of the terms", () => {
    const labels = Object.values(TERMS).map((t) => t.label);
    expect(labels.filter((l) => labels.includes(LAYOUT.addedBy(l)))).toEqual([]);
  });
});
