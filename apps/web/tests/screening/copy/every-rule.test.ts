/**
 * Every rule, every school: what the row's "Why" line and the card read never throws and never reads as false.
 *
 * Failure modes, each with the test that catches it:
 *  1. A rule whose reasons are built from another rule's list throws when that list is not loaded. The page binds the
 *     shown list first and the combined-factors lists after it, so a bottleneck rule met the gap on first paint.
 *  2. The inputs a school is said to owe its position to do not add up to the score the API gave it, so a reason names
 *     the wrong input or leaves one out.
 *  3. The extra share a bottleneck rule gives to its largest factor is credited to a factor the API did not name,
 *     or to none, or is mentioned under a rule that has no such share.
 *  4. The row and the card word the same school under the same rule differently, because one record holds more
 *     than the other.
 *  5. A sentence reads badly (a leaked value, a bare rule letter, a banned word) for some school in some dataset.
 * The datasets are the API's own saved responses, including the worst-case names and the ties.
 */
import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import * as copy from "@/lib/screening/copy";
import { parseWith } from "@/lib/screening/schema";
import { inputsResponse, resultsResponse, schoolDetailResponse } from "@/lib/screening/types";

import { readFixture, type Dataset } from "../fixtures";
import { RULES, textProblems } from "./helpers";

/** The datasets that hold a list for every rule. The empty one holds none to explain. */
const DATASETS: readonly Dataset[] = ["", "worst-names", "ties-and-ranges", "one"];
const ROOT = path.resolve(__dirname, "../../../e2e/fixtures/screening");

interface RawRow {
  cohort: string;
  scores: { lower: number | null };
  school: { school_key: string };
  maximum_term: { attained_by: string[]; contribution: number; share: number; value: number } | null;
}

/** Problems in a sentence, leaving the school's own name out: a name can hold any word, such as "Worst Case". */
const problemsIn = (text: string, name: string | null, sentence = true) =>
  textProblems(name ? text.split(name).join("Name") : text, { sentence });

const FACTOR_NAME: Record<string, string> = {
  N: "school need",
  A: "district context",
  U: "the urgency rating",
};

/** What the page binds: the shown list alone at first, then with the two combined-factors lists, then every list. */
const BINDINGS: readonly [string, (rule: copy.CopyRuleId) => readonly string[]][] = [
  ["the shown list alone", (r) => [r]],
  ["the shown and the two combined-factors lists", (r) => [...new Set([r, "additive_u", "additive_no_u"])]],
  ["every list", () => RULES],
];

describe.each(DATASETS)("the API's dataset %j", (dataset) => {
  const read = (file: string) => readFixture(file, dataset);
  const inputs = parseWith(inputsResponse, read("inputs.json"), "inputs");
  const list = (rule: string) => parseWith(resultsResponse, read(`results/${rule}.json`), rule);
  const raw = (rule: string) =>
    new Map((read(`results/${rule}.json`) as { rows: RawRow[] }).rows.map((r) => [r.school.school_key, r]));
  const detailKeys = readdirSync(path.join(ROOT, dataset, "schools"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));

  describe.each(RULES)("under %s", (rule) => {
    const rows = raw(rule);

    describe.each(BINDINGS)("bound with %s", (_label, which) => {
      const bound = copy.bindCopy({ view: rule, inputs, lists: which(rule).map(list) });

      it("words every school's reasons without throwing, in clean sentences", () => {
        expect(bound.schools).toHaveLength(rows.size);
        for (const s of bound.schools) {
          const tag = `${s.name} (${s.cohort})`;
          const why = copy.reasonSentence(s, rule);
          expect(problemsIn(why, s.name), `${tag}: ${why}`).toEqual([]);
          const drivers = copy.topDrivers(s, rule);
          for (const d of drivers) expect(problemsIn(d.sentence, s.name), tag).toEqual([]);
          // The card words each input the rule reads, as the numbers panel lists them.
          const read = (s.cohort === "queue" ? null : copy.contributions(s, rule)) ?? {};
          for (const k of Object.keys(read) as copy.InputKey[])
            expect(problemsIn(copy.inputSentence(s, k), s.name), `${tag} ${k}`).toEqual([]);
          if (s.cohort === "queue") {
            expect(copy.contributions(s, rule), tag).toBeNull();
            expect(drivers, tag).toEqual([]);
          } else {
            expect(drivers.length, tag).toBeGreaterThan(0);
          }
          // The rest of what the row and the card say about the school.
          for (const t of [
            bound.copy.rankSentence(s, rule, { name: true }),
            bound.copy.placeHeadline(s, rule),
            bound.copy.placeContext(s, rule),
            bound.copy.rowPlace(s, rule),
            ...(s.cohort === "queue" ? [...copy.missingSentences(s, rule), copy.missingGroupLabel(s)] : []),
          ])
            if (t) expect(problemsIn(t, s.name, false), tag).toEqual([]);
        }
      });

      it("adds up what each input contributes to the score the API gave", () => {
        for (const s of bound.schools) {
          const row = rows.get(s.id) as RawRow;
          if (s.cohort === "queue") continue;
          const c = copy.contributions(s, rule) as copy.Contribution;
          const sum = Object.values(c).reduce<number>((a, v) => a + (v ?? 0), 0);
          // Under the need-first rules the reasons are the five parts of school need, whose mean is school need.
          const expected = rule.startsWith("need_first")
            ? 5 * (s.components.N as number)
            : (row.scores.lower as number);
          expect(sum, `${s.name}`).toBeCloseTo(expected, 9);
          // The drivers are the largest of these, in order, and each is a fact about the school's own record.
          const drivers = copy.topDrivers(s, rule);
          const values = drivers.map((d) => c[d.key] as number);
          expect(values, `${s.name}`).toEqual([...values].sort((a, b) => b - a));
          const rest = Object.entries(c).filter(([k]) => !drivers.some((d) => d.key === k));
          for (const [, v] of rest)
            expect(v ?? 0, `${s.name}`).toBeLessThanOrEqual(values[values.length - 1] + 1e-12);
        }
      });

      it("names the factor behind a bottleneck rule's extra share as the API does, and says it under no other rule", () => {
        for (const s of bound.schools) {
          if (s.cohort === "queue") continue;
          const row = rows.get(s.id) as RawRow;
          const why = copy.reasonSentence(s, rule);
          if (!row.maximum_term) {
            expect(why, s.name as string).not.toMatch(/extra share|largest factor/);
            continue;
          }
          const named = row.maximum_term.attained_by.map((k) => FACTOR_NAME[k]);
          const said = Object.values(FACTOR_NAME).filter((n) =>
            new RegExp(`that (?:is|are) .*${n}`).test(why.split("extra share")[1] ?? "")
          );
          expect(said.sort(), `${s.name}: ${why}`).toEqual([...named].sort());
        }
      });
    });
  });

  describe("the card, from each saved detail", () => {
    it.each(detailKeys)("words school %s as its row does, under every rule", (key) => {
      const detail = parseWith(schoolDetailResponse, read(`schools/${key}.json`), key);
      for (const rule of RULES) {
        const shownOnly = copy.bindCopy({ view: rule, inputs, lists: [list(rule)] });
        const row = shownOnly.schools.find((s) => s.id === key);
        const card = copy.schoolFromDetail(detail, rule);
        if (!row) continue;
        expect(copy.reasonSentence(card, rule), `${key} ${rule}`).toBe(copy.reasonSentence(row, rule));
        expect(copy.contributions(card, rule), `${key} ${rule}`).toEqual(copy.contributions(row, rule));
        expect(copy.topDrivers(card, rule), `${key} ${rule}`).toEqual(copy.topDrivers(row, rule));
      }
    });
  });
});

describe("a tie for the largest factor", () => {
  // The saved responses hold no tie, so one is made: district context equal to school need, both named by the API.
  const inputs = parseWith(inputsResponse, readFixture("inputs.json"), "inputs");
  const body = structuredClone(readFixture("results/bottleneck_no_u.json")) as {
    rows: (RawRow & { components: Record<string, number> })[];
  };
  const tied = body.rows.find((r) => r.cohort === "complete" && r.maximum_term?.attained_by[0] === "N");
  const key = tied?.school.school_key as string;
  const before = copy.bindCopy({
    view: "bottleneck_no_u",
    inputs,
    lists: [parseWith(resultsResponse, body, "results")],
  });
  (tied as RawRow & { components: Record<string, number> }).components.A = (
    tied as RawRow & { components: Record<string, number> }
  ).components.N;
  (tied as RawRow).maximum_term!.attained_by = ["N", "A"];
  const after = copy.bindCopy({
    view: "bottleneck_no_u",
    inputs,
    lists: [parseWith(resultsResponse, body, "results")],
  });
  const of = (b: typeof after) => b.schools.find((s) => s.id === key) as copy.CopySchool;

  it("names both factors, and says they are equal", () => {
    expect(copy.reasonSentence(of(after), "bottleneck_no_u")).toMatch(
      /For this school that is school need and district context, which are equal\.$/
    );
    expect(copy.reasonSentence(of(before), "bottleneck_no_u")).toMatch(
      /For this school that is school need\.$/
    );
  });

  it("shares the extra share between them without changing the total", () => {
    const sum = (b: typeof after) =>
      Object.values(copy.contributions(of(b), "bottleneck_no_u") as copy.Contribution).reduce<number>(
        (a, v) => a + (v ?? 0),
        0
      );
    expect(sum(after)).toBeCloseTo(sum(before), 12);
    const c = copy.contributions(of(after), "bottleneck_no_u") as copy.Contribution;
    const was = copy.contributions(of(before), "bottleneck_no_u") as copy.Contribution;
    // District context gains half of the term and school need keeps the other half.
    expect((c.area as number) - (was.area as number)).toBeCloseTo(
      (tied?.maximum_term?.contribution as number) / 2,
      12
    );
  });
});
