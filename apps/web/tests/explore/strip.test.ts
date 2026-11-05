/**
 * The strip beside each comparison line on the school card (lib/explore/strip.ts). Failure modes, each with the test
 * that catches it:
 *  1. The school's dot is placed by another copy of its record than the one its line compares, so the two can disagree
 *                                                          -> "places the school by its own record ..."
 *  2. A school outside the list, or one whose record gives no figure, gets a strip; or another school with no figure
 *     is counted in a column, so a blank reads as a zero  -> "gives no strip to a school outside the list ..."
 *  3. The strip disagrees with the line beside it: its columns run the other way, so the schools the line says record
 *     more sit on the dot's left; it counts another list; or the dot's column leaves out a school level with it
 *                                                          -> "on every saved dataset, under every rule, ..."
 */
import { describe, expect, it } from "vitest";

import { PART_KEYS } from "@/lib/explore/parts";
import { partStrip } from "@/lib/explore/strip";
import { RULE_IDS, bindCopy, inList, partFigure } from "@/lib/screening/copy";
import type { CopySchool } from "@/lib/screening/copy/model";
import { parseWith } from "@/lib/screening/schema";
import { inputsResponse, resultsResponse } from "@/lib/screening/types";

import { school } from "../screening/copy/helpers";
import { type Dataset, readFixture } from "../screening/fixtures";

const RULE = "additive_no_u";
const withClassrooms = (id: string, permanent: number | null, total: number | null, spec = {}) =>
  school({ id, ...spec, condition: { classrooms_permanent: permanent, classrooms_total: total } });

describe("partStrip", () => {
  it("places the school by its own record, the one its line compares, not by the list's copy of it", () => {
    const list = [
      withClassrooms("a", 0, 8),
      withClassrooms("b", 4, 8),
      withClassrooms("c", 8, 8),
      // The list's copy of the school records no permanent classrooms.
      withClassrooms("own", 0, 8),
    ];
    // Its card's record, the one the line compares, records only permanent ones.
    const strip = partStrip("classrooms", withClassrooms("own", 8, 8), list, RULE);
    // None, the four quarters, and all: two schools with all, the card's school one of them; none counted twice.
    expect(strip).toEqual({ counts: [1, 0, 0, 1, 0, 2], at: 5 });
  });

  it("gives no strip to a school outside the list or with no figure, and counts no school without one", () => {
    const list = [
      withClassrooms("a", 2, 8),
      withClassrooms("blank", null, 8),
      withClassrooms("waiting", 8, 8, { cohort: "queue" }),
      withClassrooms("own", 6, 8),
    ];
    const own = list[3];
    // The blank record and the record to verify are in no column: two schools are drawn, not four.
    expect(partStrip("classrooms", own, list, RULE)).toEqual({ counts: [0, 0, 1, 0, 1, 0], at: 4 });
    expect(partStrip("classrooms", list[1], list, RULE)).toBeNull();
    expect(partStrip("classrooms", list[2], list, RULE)).toBeNull();
  });

  // The line's groups as the requirement states them: the other schools of the list with a figure, by whether it is
  // larger than, smaller than or equal to the school's own. Facility types, power and water, and remoteness have one
  // column per figure, so there the strip's sides are the line's groups exactly; a share's quarters hold a range of
  // figures, so there each side holds no school of the other group, and the dot's column holds every level school.
  const EXACT = new Set(["facilities", "services", "locality"]);
  const DATASETS: readonly Dataset[] = ["", "ties-and-ranges", "worst-names", "one"];

  it.each(DATASETS)(
    "on every saved dataset, under every rule, the strip's sides hold the schools its line counts on each side (%j)",
    (dataset) => {
      const inputs = parseWith(inputsResponse, readFixture("inputs.json", dataset), "inputs");
      let checked = 0;
      for (const rule of RULE_IDS) {
        const list = parseWith(resultsResponse, readFixture(`results/${rule}.json`, dataset), rule);
        const { schools } = bindCopy({ view: rule, inputs, lists: [list] });
        for (const own of schools) {
          for (const key of PART_KEYS) {
            const strip = partStrip(key, own, schools, rule);
            const mine = partFigure(own, key);
            if (!inList(own, rule) || mine === null) {
              expect(strip, `${own.id} ${key}`).toBeNull();
              continue;
            }
            if (strip === null) throw new Error(`${own.id} ${key}: no strip`);
            const others = schools.filter((s: CopySchool) => s.id !== own.id && inList(s, rule));
            const figures = others.map((s) => partFigure(s, key)).filter((f): f is number => f !== null);
            const more = figures.filter((f) => f > mine).length;
            const less = figures.filter((f) => f < mine).length;
            const same = figures.length - more - less;
            const right = strip.counts.slice(strip.at + 1).reduce((a, b) => a + b, 0);
            const left = strip.counts.slice(0, strip.at).reduce((a, b) => a + b, 0);
            const tag = `${rule} ${own.id} ${key}`;
            expect(left + strip.counts[strip.at] + right, tag).toBe(figures.length + 1);
            if (EXACT.has(key)) {
              expect([left, strip.counts[strip.at] - 1, right], tag).toEqual([less, same, more]);
            } else {
              expect(right, tag).toBeLessThanOrEqual(more);
              expect(left, tag).toBeLessThanOrEqual(less);
              expect(strip.counts[strip.at] - 1, tag).toBeGreaterThanOrEqual(same);
            }
            checked += 1;
          }
        }
      }
      expect(checked).toBeGreaterThan(0);
    }
  );
});
