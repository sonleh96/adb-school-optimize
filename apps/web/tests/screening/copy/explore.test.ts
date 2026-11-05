/**
 * The explore page's words (lib/screening/copy/explore.ts). Failure modes, each with the test that catches it:
 *  1. A sentence or label breaks the writing rules: a banned word, a dash, a double space, a leaked value, "place"
 *     for a rank                                      -> "every string and every sentence keeps the writing rules"
 *  2. A share of the list claims more than the data holds: rounded up, "every school" when one is missing, or a
 *     share where the list is too short to give one   -> "never claims more of the list than it holds"
 *  3. A verb disagrees with its subject, as in "every school in the list record"
 *                                                     -> "agrees the verb with its subject"
 *  4. A step of a kind the part never has is worded as if it were a real record
 *                                                     -> "refuses a step the part's axis never has"
 *  5. The page writes a word of its own, outside the copy and its guards
 *                                                     -> "the page writes no word of its own"
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { EXPLORE } from "@/lib/screening/copy/explore";
import type { NeedKey, PartStep } from "@/lib/screening/copy/model";

import { literalsIn, textProblems } from "./helpers";

const SHARE: PartStep[] = [
  { kind: "none" },
  { kind: "quarter", quarter: 0 },
  { kind: "quarter", quarter: 1 },
  { kind: "quarter", quarter: 2 },
  { kind: "quarter", quarter: 3 },
  { kind: "whole" },
];
/** Every step each part's axis can hold. Power and water's scores are the ones the research team's scale can give. */
const STEPS: Record<NeedKey, PartStep[]> = {
  classrooms: SHARE,
  housing: SHARE,
  facilities: [0, 1, 2, 3, 4, 5, 6].map((count) => ({ kind: "count", count })),
  services: [4, 5, 6, 7, 8, 9, 12, 13, 14, 17].map((points) => ({ kind: "points", points })),
  locality: [0, 1, 2, 3, 4, 5].map((index) => ({ kind: "category", index })),
};
const KEYS = Object.keys(STEPS) as NeedKey[];
/** Lists on both sides of 20 schools, and the counts a column can hold in each. */
const LISTS = [1, 2, 3, 19, 20, 21, 47, 1284].flatMap((total) =>
  [...new Set([1, 2, Math.floor(total / 10), Math.floor(total / 2), total - 1, total])]
    .filter((count) => count >= 1 && count <= total)
    .map((count) => ({ count, total }))
);

describe("the explore page's words", () => {
  it("every string and every sentence keeps the writing rules", () => {
    const problems: string[] = [];
    const check = (label: string, text: string, sentence: boolean) => {
      for (const problem of textProblems(text, { sentence })) problems.push(`${label}: ${problem} | ${text}`);
    };
    const { parts, compare, pick, table } = EXPLORE;
    for (const [label, text] of [
      ["title", EXPLORE.title],
      ["skip", EXPLORE.skip],
      ["others", EXPLORE.others],
      ["pick.label", pick.label],
      ["pick.none", pick.none],
      ...Object.entries(table).map(([k, v]) => [`table.${k}`, v]),
    ])
      check(label, text, false);
    for (const [label, text] of [
      ["lede", EXPLORE.lede],
      ["caveat", EXPLORE.caveat],
      ["loading", EXPLORE.loading],
      ["pick.hint", pick.hint],
      ["pick.notInList", pick.notInList],
      ["compare.lede", compare.lede],
      ["compare.question", compare.question],
    ])
      check(label, text, true);
    for (const count of [1, 2, 27, 1284]) {
      check(`scope(${count})`, EXPLORE.scope(count, "the main method"), true);
      check(`unrecorded(${count})`, EXPLORE.unrecorded(count), true);
    }
    for (const key of KEYS) {
      const words = parts[key];
      check(`${key}.title`, words.title, false);
      check(`${key}.axis`, words.axis, false);
      check(`${key}.direction`, words.direction, true);
      for (const quarter of [1, 2, 3] as const)
        if (words.edge) check(`${key}.edge`, words.edge(quarter), false);
      for (const step of STEPS[key]) {
        check(`${key}.label ${JSON.stringify(step)}`, words.label(step), false);
        for (const { count, total } of LISTS)
          check(
            `${key}.most ${JSON.stringify(step)} ${count}/${total}`,
            EXPLORE.most(key, step, count, total),
            true
          );
      }
    }
    expect(problems).toEqual([]);
  });

  it("never claims more of the list than it holds, and gives counts where the list is too short for shares", () => {
    const none: PartStep = { kind: "count", count: 0 };
    const said = (count: number, total: number) => EXPLORE.most("facilities", none, count, total);
    // Shares are of the whole list, rounded down to whole tenths: 61 of 125 is 48.8%, so 4 in 10.
    expect(said(61, 125)).toBe("4 in 10 schools in the list record none of the six facility types.");
    expect(said(19, 20)).toMatch(/^9 in 10 /);
    expect(said(1, 20)).toMatch(/^Fewer than 1 in 10 /);
    expect(said(20, 21)).toMatch(/^9 in 10 /);
    // Below 20 schools, the count itself; "every" only when no school of the list is left out.
    expect(said(18, 19)).toMatch(/^18 of the 19 schools in the list record /);
    expect(said(21, 21)).toMatch(/^Every school in the list records /);
    expect(said(2, 2)).toMatch(/^Both schools in the list record /);
    expect(said(1, 1)).toMatch(/^The one school in the list records /);
  });

  it("agrees the verb with its subject", () => {
    for (const key of KEYS)
      for (const step of STEPS[key]) {
        const words = EXPLORE.parts[key].records(step);
        expect(EXPLORE.most(key, step, 1, 3)).toContain(` ${words.one}.`);
        expect(EXPLORE.most(key, step, 2, 3)).toContain(` ${words.many}.`);
        expect(EXPLORE.most(key, step, 30, 30)).toContain(` ${words.one}.`);
        expect(EXPLORE.most(key, step, 9, 30)).toContain(` ${words.many}.`);
      }
  });

  it("refuses a step the part's axis never has", () => {
    expect(() => EXPLORE.parts.facilities.label({ kind: "none" })).toThrow(/facilities/);
    expect(() => EXPLORE.parts.classrooms.records({ kind: "count", count: 2 })).toThrow(/classrooms/);
    expect(() => EXPLORE.most("locality", { kind: "points", points: 4 }, 1, 2)).toThrow(/locality/);
  });

  it("the page writes no word of its own", () => {
    const root = path.resolve(__dirname, "../../..");
    const dir = path.join(root, "components/explore");
    const files = [
      path.join(root, "app/explore/page.tsx"),
      path.join(root, "app/explore/layout.tsx"),
      ...readdirSync(dir)
        .filter((file) => file.endsWith(".tsx"))
        .map((file) => path.join(dir, file)),
    ];
    expect(files.length).toBeGreaterThan(3);
    for (const file of files) expect(literalsIn(readFileSync(file, "utf8")), file).toEqual([]);
  });
});
