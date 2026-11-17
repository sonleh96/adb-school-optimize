/**
 * The words of the explore page's province section (lib/screening/copy/explore-province.ts). Failure modes, each with
 * the test that catches it:
 *  1. A sentence or label breaks the writing rules: a banned word, a dash, a double space, a leaked value, "place"
 *     for a rank                                     -> "every string and every sentence keeps the writing rules"
 *  2. A verb disagrees with its count, as in "1 records" or "2 has", or a share of none is still said
 *                                                    -> "agrees each verb with its count, and leaves out a group of none"
 *  3. The records to verify are called incomplete, or every one of them is said to miss a detail, though some give
 *     every detail and record 0 classrooms           -> "never calls the records to verify incomplete ..."
 *  4. The rule that counts a record once is not said where a record could be in both groups
 *                                                    -> "says how a record with both reasons is counted ..."
 *  5. A school that shows a range is said to be outside the top 20, which its own card can contradict ("It is in the
 *     top 20 either way"); or how many could reach the top 20 is said here and again under the map
 *                                                    -> "says how a range school is counted ..."
 *  6. The answer claims more provinces than the data gives, or reads its count of the provinces the records name as
 *     the country's ("of the 22 provinces"), or leaves out the schools with no province
 *                                                    -> "answers with the data's own counts ..."
 *  7. The section writes a word of its own, outside the copy and its guards
 *                                                    -> "the section writes no word of its own"
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { EXPLORE_PROVINCE as WORDS } from "@/lib/screening/copy/explore-province";

import { literalsIn, textProblems } from "./helpers";

const COUNTS = [0, 1, 2, 3, 9, 10, 52, 1284];
/** Counts of records to verify and their groups that add up, each group from none to all. */
const QUEUES = COUNTS.flatMap((queue) =>
  [
    [queue, 0, 0],
    [0, queue, 0],
    [0, 0, queue],
    [Math.ceil(queue / 2), Math.floor(queue / 2), 0],
    [Math.floor(queue / 3), Math.floor(queue / 3), queue - 2 * Math.floor(queue / 3)],
  ].map(([missing, zero, other]) => ({ queue, missing, zero, other }))
);
const reasonsOf = ({ queue, missing, zero, other }: (typeof QUEUES)[number]) =>
  WORDS.reasons(queue, missing, zero, other);

describe("the province section's words", () => {
  it("every string and every sentence keeps the writing rules", () => {
    const problems: string[] = [];
    const check = (label: string, text: string | null, sentence: boolean) => {
      if (text === null) return;
      for (const problem of textProblems(text, { sentence })) problems.push(`${label}: ${problem} | ${text}`);
    };
    for (const [label, text] of [
      ["title", WORDS.title],
      ["unrecorded", WORDS.unrecorded],
      ...Object.entries(WORDS.legend).map(([k, v]) => [`legend.${k}`, v]),
      ...Object.entries(WORDS.columns).map(([k, v]) => [`columns.${k}`, v]),
      ...Object.entries(WORDS.table).map(([k, v]) => [`table.${k}`, v]),
    ])
      check(label, text, false);
    check("question", WORDS.question, true);
    for (const unrecorded of [true, false]) check(`order(${unrecorded})`, WORDS.order(unrecorded), true);
    for (const provinces of [1, 2, 3, 22])
      for (const listed of [0, 1, 2, provinces])
        for (const unrecorded of [0, 1, 2])
          if (listed <= provinces)
            check(
              `answer(${provinces}, ${listed}, ${unrecorded})`,
              WORDS.answer(provinces, listed, unrecorded),
              true
            );
    for (const complete of COUNTS)
      for (const rule of ["additive_no_u", "additive_u", "benchmark"] as const)
        check(`top(${complete}, ${rule})`, WORDS.top(complete, rule), true);
    for (const range of COUNTS) check(`ranges(${range})`, WORDS.ranges(range), true);
    for (const counts of QUEUES) check(`reasons(${JSON.stringify(counts)})`, reasonsOf(counts), true);
    for (const province of ["North Province", null])
      for (const inList of [1, 2, 3, 125])
        check(`marked(${province}, ${inList})`, WORDS.marked(province, inList), true);
    expect(problems).toEqual([]);
  });

  it("agrees each verb with its count, and leaves out a group of none", () => {
    expect(WORDS.reasons(3, 1, 2, 0)).toMatch(
      /^Of the 3 records not in the list yet, 1 has a detail missing and 2 record 0 classrooms in total\. /
    );
    expect(WORDS.reasons(3, 2, 0, 1)).toMatch(
      /^Of the 3 records not in the list yet, 2 have a detail missing and 1 needs checking for another reason\. /
    );
    expect(WORDS.reasons(1, 0, 1, 0)).toMatch(
      /^The one record not in the list yet records 0 classrooms in total\. /
    );
    expect(WORDS.reasons(2, 2, 0, 0)).toMatch(/^Both records not in the list yet have a detail missing\. /);
    expect(WORDS.reasons(9, 0, 0, 9)).toMatch(
      /^All 9 records not in the list yet need checking for another reason\. /
    );
    expect(WORDS.marked("North Province", 1)).toBe("It is the one school in the list from North Province.");
    expect(WORDS.marked(null, 2)).toBe(
      "Its record gives no province, and neither does 1 other school in the list."
    );
    expect(WORDS.ranges(1)).toBe(
      "The one school that shows a range has no single rank, so the chart counts it with the other schools in the list."
    );
  });

  it("never calls the records to verify incomplete, nor says every one misses a detail", () => {
    for (const counts of QUEUES) {
      const text = reasonsOf(counts);
      expect(text, text).not.toMatch(
        /\bincomplete\b|missing information|information (about them|about it) is missing/i
      );
      // A record that gives 0 classrooms is counted as such, never folded into the records with a detail missing.
      if (counts.zero > 0) expect(text, text).toMatch(/\b0 classrooms in total\b/);
    }
    expect(WORDS.reasons(0, 0, 0, 0)).toBe("No record needs verifying, so every school is in the list.");
  });

  it("says how a record with both reasons is counted, and that waiting says nothing about need", () => {
    // Most with a detail missing, the rest with 0 classrooms, as in the paper's records to verify.
    expect(WORDS.reasons(90, 54, 36, 0)).toBe(
      "Of the 90 records not in the list yet, 54 have a detail missing and 36 record 0 classrooms in total. A record that has a detail missing and also records 0 classrooms counts once, with the detail missing. A recorded 0 needs checking; it is not a blank. Not being in the list yet does not mean a school's need is low."
    );
    for (const counts of QUEUES.filter((c) => c.queue > 0)) {
      const text = reasonsOf(counts);
      expect(text.includes("counts once, with the detail missing"), text).toBe(counts.missing > 0);
      expect(text, text).toMatch(/Not being in the list yet does not mean a school's need is low\.$/);
    }
  });

  it("says how a range school is counted, never that it is outside the top 20", () => {
    expect(WORDS.ranges(0)).toBeNull();
    expect(WORDS.ranges(4)).toBe(
      "The four schools that show a range have no single rank, so the chart counts them with the other schools in the list."
    );
    for (const range of COUNTS.filter((n) => n > 0)) {
      const text = WORDS.ranges(range)!;
      expect(text, text).toMatch(/counts (it|them) with the other schools in the list\./);
      expect(text, text).not.toMatch(/(not|outside|out of) (in )?the top 20/i);
      // How many could reach the top 20 is the map's note, so it is said once, there.
      expect(text, text).not.toMatch(/top 20/);
    }
    // The top 20 counts the first 20 ranks among the schools with one rank each, as the top list does.
    expect(WORDS.top(130, "additive_no_u")).toBe(
      "The top 20 are the first 20 ranks in the list, among the 130 schools with a record for every input the rule uses."
    );
    expect(WORDS.top(16, "additive_no_u")).toBe(
      "Only 16 schools have a single rank, so all of them are in the top 20."
    );
  });

  it("answers with the data's own counts, the schools with no province included", () => {
    expect(WORDS.answer(22, 21, 0)).toBe(
      "The records name 22 provinces, and the schools in the list come from 21 of them."
    );
    expect(WORDS.answer(5, 4, 1)).toBe(
      "The records name 5 provinces, and the schools in the list come from 4 of them; 1 school in the list has no province recorded."
    );
    expect(WORDS.answer(3, 3, 0)).toBe(
      "The records name 3 provinces, and the schools in the list come from all of them."
    );
    expect(WORDS.answer(2, 2, 0)).toBe(
      "The records name 2 provinces, and the schools in the list come from both."
    );
    expect(WORDS.answer(1, 1, 0)).toBe(
      "The records name one province, and the schools in the list come from it."
    );
    // The count is the provinces the records name, never said as the country's.
    for (const [provinces, listed] of [
      [22, 21],
      [20, 20],
      [5, 4],
    ])
      expect(WORDS.answer(provinces, listed, 0)).not.toMatch(
        /\bof the \d+ provinces\b|\ball \d+ provinces\b/
      );
    expect(WORDS.answer(2, 0, 3)).toBe("No school in the list has a province recorded.");
    // Which provinces hold the top 20 is the province map's answer, said once, there.
    expect(WORDS.answer(22, 21, 0)).not.toMatch(/top 20/);
  });

  it("the section writes no word of its own", () => {
    const file = path.resolve(__dirname, "../../../components/explore/sections/Province.tsx");
    expect(literalsIn(readFileSync(file, "utf8"))).toEqual([]);
  });
});
