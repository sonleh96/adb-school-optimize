/**
 * The province map's words (lib/screening/copy/explore-province-map.ts). Failure modes, each with the test that
 * catches it:
 *  1. A sentence or label breaks the writing rules: a banned word, a dash, a double space, a leaked value, "place"
 *     for a rank                       -> "every string and every sentence keeps the writing rules"
 *  2. A count disagrees with its noun or verb ("1 schools", "one school ... are"), or a sentence claims every
 *     school when some are left out   -> "agrees each count with its words"
 *  3. The section writes a word of its own, outside the copy and its guards (the explore page's own scan does not
 *     reach its sections' folder)     -> "the section writes no word of its own"
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { EXPLORE_MAP } from "@/lib/screening/copy/explore-province-map";

import { literalsIn, textProblems } from "./helpers";

const COUNTS = [0, 1, 2, 3, 9, 10, 22, 1284];
const LEADERS = [["Hela"], ["Hela", "Jiwaka"], ["Enga", "Hela", "Western Highlands"]];

describe("the province map's words", () => {
  it("every string and every sentence keeps the writing rules", () => {
    const problems: string[] = [];
    const check = (label: string, text: string, sentence: boolean) => {
      for (const problem of textProblems(text, { sentence })) problems.push(`${label}: ${problem} | ${text}`);
    };
    const { legend, table } = EXPLORE_MAP;
    for (const [label, text] of [
      ["legend.title", legend.title],
      ["legend.marked", legend.marked],
      ...Object.entries(legend.shades).map(([k, v]) => [`legend.shades.${k}`, v]),
      ...Object.entries(table).map(([k, v]) => [`table.${k}`, v]),
    ])
      check(label, text, false);
    for (const [label, text] of [
      ["question", EXPLORE_MAP.question],
      ["location", EXPLORE_MAP.location],
      ["credit", EXPLORE_MAP.credit.text],
      ["failed", EXPLORE_MAP.failed],
      ["markedOff", EXPLORE_MAP.markedOff("Hillside Secondary")],
    ])
      check(label, text, true);
    for (const holding of [0, 1, 2, 10, 22])
      for (const leaders of LEADERS)
        for (const most of [1, 2, 7])
          check(
            `answer(${holding}, ${leaders.length}, ${most})`,
            EXPLORE_MAP.answer(holding, 22, leaders, most),
            true
          );
    for (const count of COUNTS) {
      check(`marked(${count})`, EXPLORE_MAP.marked("Hillside Secondary", "Hela", count), true);
      if (count > 0) check(`ranges(${count})`, EXPLORE_MAP.ranges(count), true);
      for (const top20 of COUNTS.filter((t) => t <= count))
        if (count > 0) check(`offMap(${count}, ${top20})`, EXPLORE_MAP.offMap(count, top20), true);
    }
    expect(problems).toEqual([]);
  });

  it("agrees each count with its words", () => {
    expect(EXPLORE_MAP.answer(10, 22, ["Jiwaka"], 6)).toBe(
      "10 of the 22 provinces have schools in the top 20, and Jiwaka has the most, 6."
    );
    expect(EXPLORE_MAP.answer(3, 22, ["Hela", "Jiwaka"], 3)).toBe(
      "3 of the 22 provinces have schools in the top 20, and Hela and Jiwaka have the most, 3 each."
    );
    expect(EXPLORE_MAP.answer(8, 22, ["Enga", "Gulf"], 1)).toBe(
      "8 of the 22 provinces have schools in the top 20, one each."
    );
    expect(EXPLORE_MAP.answer(1, 22, ["Gulf"], 1)).toBe("Only Gulf has a school in the top 20.");
    expect(EXPLORE_MAP.answer(1, 22, ["Gulf"], 20)).toBe("Only Gulf has schools in the top 20, 20 of them.");
    expect(EXPLORE_MAP.marked("Hillside Secondary", "Hela", 0)).toMatch(/Hela has none of the top 20\.$/);
    expect(EXPLORE_MAP.offMap(1, 1)).toBe(
      "The record of one school names no province on this map, so the map leaves it out. It is in the top 20. The table lists it last."
    );
    expect(EXPLORE_MAP.offMap(3, 3)).toMatch(/\. All of them are in the top 20\. /);
    expect(EXPLORE_MAP.offMap(3, 1)).toMatch(/\. 1 of them is in the top 20\. /);
    expect(EXPLORE_MAP.offMap(3, 0)).not.toMatch(/top 20/);
    expect(EXPLORE_MAP.ranges(1)).toMatch(/^One school that shows a range could /);
    expect(EXPLORE_MAP.ranges(2)).toMatch(/^Two schools that show a range could /);
  });

  it("the section writes no word of its own", () => {
    const file = path.resolve(__dirname, "../../../components/explore/sections/ProvinceMap.tsx");
    expect(literalsIn(readFileSync(file, "utf8"))).toEqual([]);
  });
});
