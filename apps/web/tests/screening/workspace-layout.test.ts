/**
 * Failure modes of the three decisions part (b) of the workspace rests on:
 *  1. The layout: a width lands in the wrong mode at a breakpoint; the list stays beside an open card that leaves the
 *     map under 480 px, or steps aside when there is room; the narrow map band is too short on a short window.
 *  2. The place bands (R12): a long list has no band for its later places (the map stopped drawing at 720 schools),
 *     a short list repeats or reorders bands, one school gets a band other than "1st", a place past the last cut has
 *     no band.
 *  3. "Why it sits here": reasons numbered out of reading order, a need part counted twice or missing from the need
 *     box, or a reason cut in the wrong place when the copy's sentence changes.
 */
import { describe, expect, it } from "vitest";

import { bandOf, placeBands } from "@/lib/screening/workspace/bands";
import { layoutOf, modeOf } from "@/lib/screening/workspace/layout";
import { whyBlocks } from "@/lib/screening/workspace/why";

describe("layoutOf", () => {
  it("puts each width in its mode, at the breakpoints", () => {
    expect([1600, 1440, 1439, 1280, 1279, 1024, 1023, 800, 360].map(modeOf)).toEqual([
      "wide",
      "wide",
      "desktop",
      "desktop",
      "compact",
      "compact",
      "narrow",
      "narrow",
      "narrow",
    ]);
  });

  it("steps the list aside only when an open card would leave the map under 480 px", () => {
    const at = (width: number, cardOpen = true, rail = 0) =>
      layoutOf({ width, height: 900, cardOpen, rail }).docked;
    // 1440 - 416 - 392 - 64 = 568 px of map: room. With a 312 px rail open: 256 px, so the list steps aside.
    expect([at(1440), at(1440, true, 312), at(1440, false, 312)]).toEqual([false, true, false]);
    // 1280 - 384 - 360 - 64 = 472 px; 1300 leaves 492 px.
    expect([at(1280), at(1300)]).toEqual([true, false]);
    // Compact and narrow always give the card the list's place.
    expect([at(1200), at(800), at(800, false)]).toEqual([true, true, false]);
  });

  it("gives the narrow map band 40 percent of the window, and less on a short window", () => {
    expect(layoutOf({ width: 768, height: 1024, cardOpen: false }).band).toBe(410);
    expect(layoutOf({ width: 768, height: 600, cardOpen: false }).band).toBe(240);
    // 200 percent zoom on a 1600 by 1000 screen: the list region keeps 284 px.
    expect(layoutOf({ width: 800, height: 500, cardOpen: false }).band).toBe(160);
    expect(layoutOf({ width: 800, height: 360, cardOpen: false }).band).toBe(160);
    expect(layoutOf({ width: 1600, height: 1000, cardOpen: false }).band).toBeNull();
  });
});

describe("placeBands", () => {
  const ends = (n: number) => placeBands(n).map((band) => `${band.lo}-${band.hi}`);

  it("cuts a long list at 10, 20, a third, two thirds and its end", () => {
    expect(ends(90)).toEqual(["1-10", "11-20", "21-30", "31-60", "61-90"]);
  });

  it("scales the later cuts with a long list, so every place has a band", () => {
    expect(ends(720)).toEqual(["1-10", "11-20", "21-240", "241-480", "481-720"]);
    expect(bandOf(720, placeBands(720))).toBe(4);
  });

  it("collapses a short list to fewer bands, in order, without repeats", () => {
    expect(ends(16)).toEqual(["1-10", "11-16"]);
    expect(ends(25)).toEqual(["1-10", "11-20", "21-25"]);
    expect(ends(1)).toEqual(["1-1"]);
    expect(ends(0)).toEqual([]);
  });

  it("puts a place past the last cut in the last band", () => {
    expect(bandOf(30, placeBands(16))).toBe(1);
    expect(bandOf(10, placeBands(16))).toBe(0);
    expect(bandOf(11, placeBands(16))).toBe(1);
  });
});

describe("whyBlocks", () => {
  const NEED = ["classrooms", "housing", "facilities", "services", "locality"];
  const text =
    "Three things add most to its screening score under the rule. Two are parts of its school need, the measure built from five parts of its own record. None of its classrooms is permanent. It has no facilities. The other is not part of its school need. Its district is remote.";
  const drivers = [
    { key: "area", sentence: "Its district is remote." },
    { key: "classrooms", sentence: "None of its classrooms is permanent." },
    { key: "facilities", sentence: "It has no facilities." },
  ];

  it("numbers the reasons in reading order and puts the need parts in one box, numbered parts first", () => {
    expect(whyBlocks(text, drivers, NEED)).toEqual({
      // Everything before the first reason is the lead, as the design sets it.
      lead: "Three things add most to its screening score under the rule. Two are parts of its school need, the measure built from five parts of its own record.",
      blocks: [
        {
          kind: "need",
          parts: [
            { key: "classrooms", n: 1, sentence: "None of its classrooms is permanent." },
            { key: "facilities", n: 2, sentence: "It has no facilities." },
            { key: "housing", n: null, sentence: null },
            { key: "services", n: null, sentence: null },
            { key: "locality", n: null, sentence: null },
          ],
        },
        { kind: "text", text: "The other is not part of its school need." },
        { kind: "reason", key: "area", n: 3, sentence: "Its district is remote." },
      ],
    });
  });

  it("shows the text whole when a reason's sentence is not in it word for word", () => {
    const changed = [{ key: "area", sentence: "Its district is very remote." }];
    expect(whyBlocks(text, changed, NEED)).toEqual({ lead: text, blocks: [] });
  });
});
