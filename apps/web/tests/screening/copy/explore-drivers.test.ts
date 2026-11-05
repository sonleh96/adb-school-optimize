/**
 * The words of the explore page's section on what puts a school in the top 20 (lib/screening/copy/explore-drivers.ts).
 * Failure modes, each with the test that catches it:
 *  1. A string breaks the writing rules: a banned word ("weighted", "best"), a dash, "place" for a rank, a number with
 *     too many decimals, a leaked value          -> "every string and every sentence keeps the writing rules"
 *  2. A sentence claims more than the data holds: "every score" when one is missing, or school need said to add the
 *     most when it does not                      -> "says every score only when every score holds"
 *  3. A verb disagrees with its subject, as in "one pair of neighbours have"
 *                                                -> "agrees the verb with its subject"
 */
import { describe, expect, it } from "vitest";

import { DRIVERS } from "@/lib/screening/copy/explore-drivers";

import { textProblems } from "./helpers";

const RULES = ["the main method", "the earlier method with its urgency rating"];
const PARTS = ["Classrooms not of permanent materials", "Missing facility types", "District context"];
const COUNTS = [
  [0, 0],
  [0, 1],
  [1, 1],
  [0, 22],
  [1, 22],
  [15, 22],
  [22, 22],
  [1284, 1284],
] as const;

describe("the drivers section's words", () => {
  it("every string and every sentence keeps the writing rules", () => {
    const problems: string[] = [];
    const check = (label: string, text: string, sentence: boolean) => {
      for (const problem of textProblems(text, { sentence })) problems.push(`${label}: ${problem} | ${text}`);
    };
    const { bars, gaps, notDrawn, rules } = DRIVERS;
    for (const [label, text] of [
      ["question", DRIVERS.question],
      ["bars.ranges", bars.ranges],
      ["gaps.lede", gaps.lede],
      ["gaps.tieNote", gaps.tieNote],
      ["gaps.roundingNote", gaps.roundingNote],
      ["gaps.closeNote", gaps.closeNote],
      ["gaps.rangesNote", gaps.rangesNote],
      ["notDrawn.unreadable", notDrawn.unreadable],
    ])
      check(label, text, true);
    for (const [label, text] of [
      ["rules.legend", rules.legend],
      ["rules.main", rules.main],
      ["rules.urgency", rules.urgency],
      ["bars.title", bars.title],
      ["bars.need", bars.need],
      ["bars.unrecorded", bars.unrecorded],
      ["bars.axis", bars.axis],
      ["bars.outside", bars.outside],
      ["gaps.title", gaps.title],
      ["gaps.tie", gaps.tie],
      ["gaps.close", gaps.close],
      ["gaps.edgeTag", gaps.edgeTag],
      ...Object.entries(bars.table)
        .filter(([, v]) => typeof v === "string")
        .map(([k, v]) => [`bars.table.${k}`, v as string]),
    ])
      check(label, text, false);
    for (const [count, total] of COUNTS) {
      check(`answer(${count}, ${total})`, DRIVERS.answer(count, total), true);
      if (total > 0)
        for (const n of [1, 2, 3])
          check(`largest ${n}`, bars.largest(PARTS.slice(0, n), count || 1, total), true);
    }
    for (const rule of RULES) {
      check("bars.lede", bars.lede(rule), true);
      check("table.caption", bars.table.caption(rule), false);
      check("notDrawn.needFirst", notDrawn.needFirst(rule), true);
      check("notDrawn.largest 2", notDrawn.largest(rule, ["School need", "District context"]), true);
      check(
        "notDrawn.largest 3",
        notDrawn.largest(rule, ["School need", "District context", "Urgency rating"]),
        true
      );
    }
    check("bars.others", bars.others(["District context", "Walking reach", "Air quality"]), false);
    check("bars.marked", bars.marked(PARTS[0], "0.126"), true);
    for (const ties of [0, 1, 2])
      for (const close of [0, 1, 3]) check(`line ${ties} ${close}`, gaps.line(ties, close), true);
    for (const gap of [null, "0.002", "under 0.001"]) check(`edge ${gap}`, gaps.edge(gap), true);
    check("pair", gaps.pair(20, 21), false);
    expect(problems).toEqual([]);
  });

  it("says every score only when every score holds, and never that school need adds the most when it does not", () => {
    expect(DRIVERS.answer(22, 22)).toBe(
      "School need adds the most. In every score below, its five parts add more than all the other inputs together."
    );
    expect(DRIVERS.answer(1, 1)).toMatch(/^School need adds the most\. In the score below, /);
    expect(DRIVERS.answer(21, 22)).toBe(
      "In 21 of the 22 scores below, the five parts of school need add more than all the other inputs together."
    );
    expect(DRIVERS.answer(0, 22)).toMatch(/^In none of the scores below /);
    expect(DRIVERS.answer(0, 0)).toMatch(/nothing to draw\.$/);
    expect(DRIVERS.bars.largest([PARTS[0]], 22, 22)).toBe(
      "The part that adds the most to every one of these 22 scores is classrooms not of permanent materials."
    );
    expect(DRIVERS.bars.largest([PARTS[0]], 15, 22)).toMatch(/ to 15 of these 22 scores is /);
    expect(DRIVERS.bars.largest([PARTS[0]], 1, 1)).toMatch(/ to the one score here is /);
  });

  it("agrees the verb with its subject", () => {
    expect(DRIVERS.gaps.line(1, 0)).toBe("One pair of neighbours has the same score.");
    expect(DRIVERS.gaps.line(2, 0)).toBe("2 pairs of neighbours have the same score.");
    expect(DRIVERS.gaps.line(0, 1)).toBe("One pair of neighbours is under 0.001 apart.");
    expect(DRIVERS.gaps.line(0, 3)).toBe("3 pairs of neighbours are under 0.001 apart.");
    expect(DRIVERS.gaps.line(1, 1)).toBe(
      "One pair of neighbours has the same score, and 1 more is under 0.001 apart."
    );
    expect(DRIVERS.gaps.line(2, 3)).toBe(
      "2 pairs of neighbours have the same score, and 3 more are under 0.001 apart."
    );
    expect(DRIVERS.bars.largest(PARTS.slice(0, 2), 8, 22)).toBe(
      "Classrooms not of permanent materials and missing facility types each add the most to 8 of these 22 scores."
    );
  });
});
