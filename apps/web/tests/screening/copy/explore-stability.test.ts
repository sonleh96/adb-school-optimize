/**
 * The words of the explore page's second question, how stable the list is (lib/screening/copy/explore-stability.ts),
 * and of the page's question index (EXPLORE.index). Failure modes, each with the test that catches it:
 *  1. A sentence or label breaks the writing rules: a banned word such as "random-weight", a dash, a leaked value, a
 *     rule letter without its name, "place" for a rank      -> "every string and every sentence keeps the writing rules"
 *  2. A share of runs reads as a chance or a probability, rather than as runs under the paper's settings
 *                                                         -> "words a share of runs as runs, never as a chance"
 *  3. A count disagrees with its noun or its verb: "1 schools", "1 of its top 20 are", "none ... are"
 *                                                         -> "agrees each count with its noun and verb"
 *  4. A column's label names the wrong side of one of its edges, so the table puts a share in the wrong row
 *                                                         -> "names each column's edges as the column holds them"
 *  5. A new chart writes a word of its own, outside the copy and its guards
 *                                                         -> "the new charts write no word of their own"
 *  6. The words for a share, the line, the band and a setting drift from the method details' words for the same
 *     shares, so the two drawings of one test read differently  -> "says a share, the line, the band and a setting
 *                                                               as the method details do"
 *  7. A column's range under the chart is missing or wrong, or names other ends than its row of the table
 *                                                         -> "names each column's range under the chart as its row does"
 *  8. The sentence that the columns are not to scale goes missing, or names a band the test does not have
 *                                                         -> the same test
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { frequencyAxis } from "@/lib/explore/frequencies";
import { EXPLORE } from "@/lib/screening/copy/explore";
import { EXPLORE_STABILITY, type FrequencyBin } from "@/lib/screening/copy/explore-stability";
import { buildMethod } from "@/lib/screening/copy/method";

import { literalsIn, textProblems } from "./helpers";

const W = EXPLORE_STABILITY;
const RULE = "the main method";
const LINE = 0.8;
const SE = Math.sqrt((0.8 * 0.2) / 5000);
const AXES = [
  frequencyAxis(LINE, { lo: LINE - 2 * SE, hi: LINE + 2 * SE }),
  frequencyAxis(LINE, { lo: LINE - SE, hi: LINE + SE }),
  frequencyAxis(LINE, null),
  frequencyAxis(LINE, { lo: 0.65, hi: 0.95 }),
];
/** Counts on both sides of one and of every school, for lists short and long. */
const COUNTS = [0, 1, 2, 3, 12, 19, 20, 21, 1284];

/** Every string the module holds and every sentence its functions make for the inputs above. */
function everything(): { label: string; text: string; sentence: boolean }[] {
  const out: { label: string; text: string; sentence: boolean }[] = [];
  const add = (label: string, text: string, sentence = true) => out.push({ label, text, sentence });
  add("question", W.question);
  add("index", EXPLORE.index, false);
  add("pick.hint", EXPLORE.pick.hint);
  for (const persistent of COUNTS)
    for (const top of [0, 1, 3, 17, 20])
      for (const kept of [0, 1, 2, top].filter((k) => k <= top))
        for (const rules of [1, 2, 7]) add(`answer`, W.answer(RULE, persistent, "80%", kept, top, rules));
  const F = W.frequencies;
  add("frequencies.title", F.title, false);
  for (const [draws, settings] of [
    [5000, 3],
    [1, 1],
    [2, 2],
  ])
    add(`frequencies.what(${draws}, ${settings})`, F.what(draws, settings));
  add("frequencies.show", F.show, false);
  for (const rule of ["additive_no_u", "additive_u"] as const)
    for (const count of COUNTS)
      add(`frequencies.persistent(${rule}, ${count})`, F.persistent(rule, count, "80%"));
  add("frequencies.urgency", F.urgency);
  add("frequencies.urgencyLoading", F.urgencyLoading);
  add("frequencies.urgencyFailed", F.urgencyFailed);
  add("frequencies.axis", F.axis, false);
  for (const axis of AXES)
    for (const bin of axis.bins) {
      add(`frequencies.bin ${JSON.stringify(bin)}`, F.bin(bin), false);
      add(`frequencies.column ${JSON.stringify(bin)}`, F.column(bin), false);
    }
  for (const band of [true, false]) add(`frequencies.notToScale(${band})`, F.notToScale("80%", band));
  add("frequencies.flag", F.flag);
  const settings = [
    { topLevel: 20, schoolNeed: 15 },
    { topLevel: 40, schoolNeed: 35 },
    { topLevel: 100, schoolNeed: 80 },
  ];
  settings.forEach((_, i) => add(`frequencies.setting(${i})`, F.setting(settings, i), false));
  for (const percent of ["90%", "79.99%"]) {
    add("frequencies.runs", F.runs(percent), false);
    add("frequencies.line", F.line(percent), false);
    add("frequencies.reaches", F.reaches(percent), false);
    add("frequencies.below", F.below(percent), false);
  }
  add("frequencies.band", F.band("78.9%", "81.1%"));
  add("frequencies.caveat", F.caveat);
  for (const count of COUNTS.filter((c) => c > 0)) add(`frequencies.undrawn(${count})`, F.undrawn(count));
  add("frequencies.none", F.none);
  add("frequencies.markedNone", `School name ${F.markedNone}`);
  add("frequencies.table.share", F.table.share, false);
  add("frequencies.table.undrawn", F.table.undrawn, false);
  const B = W.bump;
  add("bump.title", B.title(RULE), false);
  add("bump.loading", B.loading);
  for (const top of [1, 3, 17, 20])
    for (const kept of [0, 1, 2, top].filter((k) => k <= top)) add("bump.answer", B.answer(kept, top, 7));
  add("bump.what", B.what(RULE));
  add("bump.pairs", B.pairs);
  for (const word of [B.without, B.with, B.axis, B.lane, B.table.school, B.table.none, B.table.marked])
    add("bump word", word, false);
  for (const n of [21, 22, 131, 1284]) add(`bump.closer(21, ${n})`, B.closer(21, n));
  add("bump.range", B.range);
  add("bump.out", B.out);
  for (const rank of ["21st", "45th", "1,284th"]) add("bump.below", `School name ${B.below(RULE, rank)}`);
  add("bump.ranged", `School name ${B.ranged(RULE)}`);
  for (const count of COUNTS.filter((c) => c > 0)) add(`bump.reaching(${count})`, B.reaching(count));
  add("bump.table.either", B.table.either("5"), false);
  return out;
}

describe("the stability question's words", () => {
  it("every string and every sentence keeps the writing rules", () => {
    const problems = everything().flatMap(({ label, text, sentence }) =>
      textProblems(text, { sentence, schoolNames: ["School name"] }).map((p) => `${label}: ${p} | ${text}`)
    );
    expect(problems).toEqual([]);
  });

  it("words a share of runs as runs, never as a chance", () => {
    for (const { label, text } of everything()) {
      expect(text, label).not.toMatch(/\bchances?\b|\blikel(y|ihood)\b|\bodds\b|\bprobabl/i);
      // "Probability" only ever says what a share is not.
      for (const m of text.matchAll(/probabilit/gi))
        expect(text.slice(Math.max(0, m.index! - 6), m.index), label).toBe("not a ");
    }
  });

  it("agrees each count with its noun and verb", () => {
    expect(W.answer(RULE, 10, "80%", 12, 20, 7)).toBe(
      "Under the main method, 10 schools stayed in the top 20 in at least 80% of runs with random weights in every setting, and 12 of its top 20 are also in the top 20 under the other six rules."
    );
    expect(W.answer(RULE, 1, "80%", 1, 20, 7)).toContain(", one school stayed ");
    expect(W.answer(RULE, 1, "80%", 1, 20, 7)).toContain(" 1 of its top 20 is also ");
    expect(W.answer(RULE, 0, "80%", 0, 20, 7)).toContain(", no school stayed ");
    expect(W.answer(RULE, 0, "80%", 0, 20, 7)).toContain(
      " none of its top 20 is in the top 20 under all the other"
    );
    expect(W.answer(RULE, 2, "80%", 17, 17, 2)).toContain(
      " all of the 17 schools in its top 20 are also in the top 20 under the other rule."
    );
    // With no other rule to compare, or nothing ranked, the second half is left out rather than said of nothing.
    expect(W.answer(RULE, 3, "80%", 0, 0, 7)).toMatch(/every setting\.$/);
    expect(W.answer(RULE, 3, "80%", 2, 20, 1)).toMatch(/every setting\.$/);
    expect(W.frequencies.persistent("additive_u", 1, "80%")).toBe(
      "In the earlier method's own test, one school in its list stayed in the top 20 in at least 80% of runs in every setting."
    );
    expect(W.bump.answer(12, 20, 7)).toBe("12 of these 20 schools are in the top 20 under all seven rules.");
    expect(W.bump.answer(1, 20, 7)).toContain("1 of these 20 schools is in");
    expect(W.bump.answer(20, 20, 7)).toMatch(/^All 20 of these schools are /);
    expect(W.bump.answer(0, 17, 7)).toMatch(/^None of these schools is /);
    expect(W.frequencies.undrawn(1)).toMatch(/^One school .* has no shares .* it has no dot\.$/);
    expect(W.bump.reaching(1)).toMatch(/^One school .* Mark it /);
    expect(W.bump.reaching(2)).toMatch(/^2 schools .* Mark one /);
  });

  it("names each column's edges as the column holds them", () => {
    // The main method's test: two standard errors of 0.8 over 5,000 runs, so a band from 78.9% to 81.1%.
    const labels = AXES[0].bins.map((bin) => W.frequencies.bin(bin));
    expect(labels).toEqual([
      "0% of runs",
      "Above 0%, under 10%",
      "10% to under 50%",
      "50% to under 70%",
      "70% to under 78.9%",
      "78.9% to under 80%, in the shaded band",
      "80% to 81.1%, in the shaded band",
      "Above 81.1%, under 100%",
      "100% of runs",
    ]);
    // Without a band, the line still starts the column of the shares that reach it.
    expect(AXES[2].bins.map((bin) => W.frequencies.bin(bin))).toEqual([
      "0% of runs",
      "Above 0%, under 10%",
      "10% to under 50%",
      "50% to under 70%",
      "70% to under 80%",
      "80% to under 100%",
      "100% of runs",
    ]);
    const closedAbove: FrequencyBin = {
      kind: "span",
      from: { at: 0.5, holds: false },
      to: { at: 0.85, holds: true },
      band: false,
    };
    expect(W.frequencies.bin(closedAbove)).toBe("Above 50%, up to 85%");
  });

  it("names each column's range under the chart as its row does, and says the columns are not to scale", () => {
    const F = W.frequencies;
    const columns = (i: number) => AXES[i].bins.map((bin) => F.column(bin));
    // The main method's test, its band from 78.9% to 81.1%; the earlier method's, from 79.4% to 80.6%; and none.
    expect(columns(0)).toEqual([
      "0%",
      "under 10",
      "10 to 50",
      "50 to 70",
      "70 to 78.9",
      "78.9 to 80",
      "80 to 81.1",
      "over 81.1",
      "100%",
    ]);
    expect(columns(1)).toEqual([
      "0%",
      "under 10",
      "10 to 50",
      "50 to 70",
      "70 to 79.4",
      "79.4 to 80",
      "80 to 80.6",
      "over 80.6",
      "100%",
    ]);
    expect(columns(2)).toEqual(["0%", "under 10", "10 to 50", "50 to 70", "70 to 80", "from 80", "100%"]);
    // Every column names the ends its row of the table names, bar the 0% and 100% its neighbours hold.
    const numbers = (text: string) => [...text.matchAll(/\d+(\.\d+)?/g)].map((m) => Number(m[0]));
    for (const axis of AXES)
      for (const bin of axis.bins) {
        const row = numbers(F.bin(bin));
        expect(numbers(F.column(bin)), F.bin(bin)).toEqual(
          bin.kind === "span" ? row.filter((n) => n !== 0 && n !== 100) : row
        );
      }
    expect(F.notToScale("80%", true)).toBe(
      "The columns are ranges of different widths, drawn the same width so the narrow band near the 80% line can be seen."
    );
    expect(F.notToScale("80%", false)).not.toMatch(/band/);
  });

  it("says a share, the line, the band and a setting as the method details do", () => {
    const method = buildMethod().insp.frequencies;
    const F = W.frequencies;
    const settings = [
      { topLevel: 20, schoolNeed: 15 },
      { topLevel: 40, schoolNeed: 35 },
      { topLevel: 100, schoolNeed: 80 },
    ];
    const shuffled = [settings[1], settings[0], { topLevel: 12.5, schoolNeed: 7 }];
    for (const list of [settings, shuffled, settings.slice(0, 1)])
      list.forEach((_, i) => expect(F.setting(list, i)).toBe(method.setting(list, i)));
    for (const percent of ["90%", "79.99%", "80.1%"]) {
      expect(F.runs(percent)).toBe(method.runs(percent));
      expect(F.line(percent)).toBe(method.line(percent));
      expect(F.reaches(percent)).toBe(method.reaches(percent));
      expect(F.below(percent)).toBe(method.below(percent));
    }
    expect(F.band("78.9%", "81.1%")).toBe(method.band("78.9%", "81.1%"));
    expect(F.caveat).toBe(method.caveat);
  });

  it("the new charts write no word of their own", () => {
    const root = path.resolve(__dirname, "../../..");
    // The page's own top-level components, the question index among them, are checked in explore.test.ts.
    const files = [
      "components/explore/sections/Stability.tsx",
      "components/explore/sections/StabilityFrequencies.tsx",
      "components/explore/sections/StabilityBump.tsx",
    ];
    for (const file of files)
      expect(literalsIn(readFileSync(path.join(root, file), "utf8")), file).toEqual([]);
  });
});
