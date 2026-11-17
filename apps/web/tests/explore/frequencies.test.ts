/**
 * Which column of the top-20 frequency chart each school falls in, setting by setting (lib/explore/frequencies.ts).
 * Failure modes, each with the test that catches it:
 *  1. A share on the line lands below it, or one a hair under it at or above it, so a dot sits on the wrong side of
 *     the line                                       -> "puts every share on its own side of the line and the band"
 *  2. A share on a band edge lands outside the band, or one a hair outside lands in it, so a dot sits on the wrong
 *     side of the band                               -> the same test, at both edges of each band
 *  3. A share of exactly none or every run is mixed into a neighbouring column, hiding the piles, or a share of a
 *     single run is counted as none                  -> "keeps exactly none and exactly every run in columns of their own"
 *  4. A column holds shares from both sides of an edge it should not cross, or the columns run out of order
 *                                                    -> "puts every share ..." (each column one side) and "orders ..."
 *  5. Without a band the line or the cutoffs go missing; with a wide band a cutoff splits it
 *                                                    -> "drops the band when the test has none ..." and "keeps a wide band whole"
 *  6. A rule's dots are drawn from another rule's frequencies, or a rule with no test is drawn
 *                                                    -> "draws each rule from its own list's frequencies ..."
 *  7. A school is drawn twice or not at all in a setting, or a school whose frequencies cannot be drawn is dropped
 *     from the list's count                          -> "draws each drawable school once per setting ..."
 *  8. The count of schools that reach the line in every setting disagrees with the flags the list sends
 *                                                    -> "counts the schools the list flags"
 *  9. Every share under 70% piles into one column, so a school in the low tail reads as nearly at the line, or the
 *     columns split anywhere but the chosen cutoffs, the band's edges and the line
 *                                                    -> "splits the shares under the band at 10%, 50% and 70% ..."
 */
import { describe, expect, it } from "vitest";

import { CUTOFFS, type FrequencyAxis, binOf, frequencyAxis, frequencyPlot } from "@/lib/explore/frequencies";
import { bindCopy } from "@/lib/screening/copy";
import type { PersistenceRule } from "@/lib/screening/copy/model";
import { parseWith } from "@/lib/screening/schema";
import { resultsResponse } from "@/lib/screening/types";

import { RULES, fixtureInputs, fixtureResults } from "../screening/copy/helpers";
import { copy as clone, readFixture } from "../screening/fixtures";

/** The paper's line, and the bands of the two tests: two standard errors of 0.80 over 5,000 draws, and one. */
const LINE = 0.8;
const SE = Math.sqrt((0.8 * 0.2) / 5000);
const BANDS = {
  twoErrors: { lo: LINE - 2 * SE, hi: LINE + 2 * SE },
  oneError: { lo: LINE - SE, hi: LINE + SE },
};
const HAIR = 1e-9;

/** Shares at and either side of every edge, and a spread of others. */
function sharesFor(band: { lo: number; hi: number } | null): number[] {
  const edges = [0, ...CUTOFFS, LINE, ...(band ? [band.lo, band.hi] : []), 1];
  const near = edges.flatMap((e) => [e - HAIR, e, e + HAIR]).filter((f) => f >= 0 && f <= 1);
  const spread = Array.from({ length: 997 }, (_, i) => (i + 1) / 998);
  return [...near, 0.0002, 0.7999, 0.8014, 0.8105, 0.79, 0.7692, 0.818, 0.9999, ...spread];
}

/** The requirement, stated without the code: a share reaches the line at the line, and the band holds both its ends. */
const reaches = (f: number) => f >= LINE;
const inBand = (f: number, band: { lo: number; hi: number } | null) =>
  band !== null && f >= band.lo && f <= band.hi;

function checkSides(axis: FrequencyAxis, band: { lo: number; hi: number } | null) {
  for (const f of sharesFor(band)) {
    const index = binOf(axis, f);
    const bin = axis.bins[index];
    expect(index >= axis.line, `${f} against the line`).toBe(reaches(f));
    expect(bin.kind === "span" && bin.band, `${f} against the band`).toBe(inBand(f, band));
  }
}

describe("frequencyAxis", () => {
  it("puts every share on its own side of the line and the band, at both edges of each band", () => {
    for (const band of [BANDS.twoErrors, BANDS.oneError]) checkSides(frequencyAxis(LINE, band), band);
  });

  it("keeps exactly none and exactly every run in columns of their own", () => {
    const axis = frequencyAxis(LINE, BANDS.twoErrors);
    expect(axis.bins[binOf(axis, 0)].kind).toBe("none");
    expect(axis.bins[binOf(axis, 1)].kind).toBe("all");
    // One run in 5,000, and all but one, are neither.
    for (const f of [1 / 5000, 4999 / 5000]) expect(axis.bins[binOf(axis, f)].kind).toBe("span");
    expect(binOf(axis, 0)).toBe(0);
    expect(binOf(axis, 1)).toBe(axis.bins.length - 1);
  });

  it("orders its columns by share, each cutoff and the line starting the column after its edge", () => {
    const axis = frequencyAxis(LINE, BANDS.twoErrors);
    const shares = sharesFor(BANDS.twoErrors).sort((a, b) => a - b);
    for (let i = 1; i < shares.length; i += 1)
      expect(binOf(axis, shares[i]), `${shares[i - 1]} then ${shares[i]}`).toBeGreaterThanOrEqual(
        binOf(axis, shares[i - 1])
      );
    // A share on a cutoff or on the line starts the column after the edge, and one a hair under it is before it.
    for (const at of [...CUTOFFS, LINE]) {
      const edge = axis.bins.findIndex((bin) => bin.kind === "span" && bin.from.at === at);
      expect(edge, `${at}`).toBeGreaterThan(0);
      expect(binOf(axis, at)).toBe(edge);
      expect(binOf(axis, at - HAIR)).toBe(edge - 1);
    }
    expect(axis.bins[axis.line]).toMatchObject({ kind: "span", from: { at: LINE, holds: true } });
    // The band's two columns sit either side of the line.
    const band = axis.bins.flatMap((bin, i) => (bin.kind === "span" && bin.band ? [i] : []));
    expect(band).toEqual([axis.line - 1, axis.line]);
  });

  it("splits the shares under the band at 10%, 50% and 70%, so the low tail never piles up beside the line", () => {
    const ends = (axis: FrequencyAxis) =>
      axis.bins.map((bin) => (bin.kind === "span" ? [bin.from.at, bin.to.at] : bin.kind));
    for (const band of [BANDS.twoErrors, BANDS.oneError])
      expect(ends(frequencyAxis(LINE, band))).toEqual([
        "none",
        [0, 0.1],
        [0.1, 0.5],
        [0.5, 0.7],
        [0.7, band.lo],
        [band.lo, LINE],
        [LINE, band.hi],
        [band.hi, 1],
        "all",
      ]);
    // A school in one run in a hundred and one in two runs of three sit two columns apart, neither beside the band.
    const axis = frequencyAxis(LINE, BANDS.twoErrors);
    expect(binOf(axis, 0.01)).toBe(1);
    expect(binOf(axis, 0.66)).toBe(3);
    expect(axis.line - binOf(axis, 0.66)).toBe(3);
  });

  it("drops the band when the test has none, and keeps the line and the cutoffs", () => {
    const axis = frequencyAxis(LINE, null);
    checkSides(axis, null);
    expect(axis.bins.some((bin) => bin.kind === "span" && bin.band)).toBe(false);
    const starts = axis.bins.flatMap((bin) => (bin.kind === "span" ? [bin.from.at] : []));
    expect(starts).toEqual([0, ...CUTOFFS, LINE]);
    expect(axis.bins[axis.line]).toMatchObject({ kind: "span", from: { at: LINE, holds: true } });
  });

  it("keeps a wide band whole, leaving out a cutoff that falls inside it", () => {
    const wide = { lo: 0.65, hi: 0.95 };
    const axis = frequencyAxis(LINE, wide);
    checkSides(axis, wide);
    const starts = axis.bins.flatMap((bin) => (bin.kind === "span" ? [bin.from.at] : []));
    expect(starts).toEqual([0, 0.1, 0.5, 0.65, LINE, 0.95]);
    const band = axis.bins.flatMap((bin, i) => (bin.kind === "span" && bin.band ? [i] : []));
    expect(band).toEqual([axis.line - 1, axis.line]);
  });
});

const inputs = fixtureInputs();
const lists = RULES.map((rule) => fixtureResults(rule));
const bound = bindCopy({ view: "additive_no_u", inputs, lists });

/** A list's rows as saved, read without the code under test: the frequencies and flags each rule's list sends. */
interface Saved {
  cohort: string;
  school: { school_key: string };
  persistent_candidate?: boolean | null;
  top20_frequencies?: { setting_id: string; frequency: number }[] | null;
}
const savedRows = (rule: PersistenceRule): Saved[] =>
  (readFixture(`results/${rule}.json`) as { rows: Saved[] }).rows;

describe("frequencyPlot", () => {
  it("draws each rule from its own list's frequencies, and nothing for a rule whose list has no test", () => {
    for (const rule of ["additive_no_u", "additive_u"] as const) {
      const plot = frequencyPlot(bound.schools, rule, bound.copy.persistenceTest(rule))!;
      const band = plot.axis.band;
      for (const row of savedRows(rule)) {
        if (row.cohort === "verification_queue" || !row.top20_frequencies) continue;
        row.top20_frequencies.forEach(({ frequency }, setting) => {
          const index = plot.rows[setting].findIndex((column) =>
            column.some((s) => s.id === row.school.school_key)
          );
          expect(index, `${rule} ${row.school.school_key} ${setting}`).toBeGreaterThanOrEqual(0);
          expect(index >= plot.axis.line).toBe(reaches(frequency));
          const bin = plot.axis.bins[index];
          expect(bin.kind === "span" && bin.band).toBe(inBand(frequency, band));
        });
      }
    }
    // The fixtures send a school's frequencies under both rules, apart in the second setting: 90% under the main
    // method's test, and 79.99% under the earlier method's. Each rule's chart puts it where its own test says.
    const key = savedRows("additive_u").find((row) =>
      row.top20_frequencies?.some((f) => f.frequency === 0.7999)
    )!.school.school_key;
    const sideIn = (rule: PersistenceRule) => {
      const plot = frequencyPlot(bound.schools, rule, bound.copy.persistenceTest(rule))!;
      return plot.rows[1].findIndex((column) => column.some((s) => s.id === key)) >= plot.axis.line;
    };
    expect(sideIn("additive_no_u")).toBe(true);
    expect(sideIn("additive_u")).toBe(false);

    // A list that carries no test, or no list at all for the rule, draws nothing.
    const bare = clone(readFixture("results/additive_u.json")) as { persistence: unknown };
    bare.persistence = null;
    const without = bindCopy({
      view: "additive_no_u",
      inputs,
      lists: [
        ...lists.filter((l) => l.run.rule_id !== "additive_u"),
        parseWith(resultsResponse, bare, "bare"),
      ],
    });
    expect(without.copy.persistenceTest("additive_u")).toBeUndefined();
    expect(frequencyPlot(without.schools, "additive_u", undefined)).toBeNull();
  });

  it("draws each drawable school once per setting, and counts the undrawable ones in the list without a dot", () => {
    const rule = "additive_no_u";
    const plot = frequencyPlot(bound.schools, rule, bound.copy.persistenceTest(rule))!;
    const listed = savedRows(rule).filter((row) => row.cohort !== "verification_queue");
    const withShares = listed.filter((row) => row.top20_frequencies);
    for (const columns of plot.rows) {
      const ids = columns.flat().map((s) => s.id);
      expect(ids.sort()).toEqual(withShares.map((row) => row.school.school_key).sort());
    }
    expect(plot.undrawn.map((s) => s.id).sort()).toEqual(
      listed
        .filter((row) => !row.top20_frequencies)
        .map((row) => row.school.school_key)
        .sort()
    );

    // A school whose shares disagree with its flag is not drawn, and still counts in the list.
    const broken = clone(readFixture(`results/${rule}.json`)) as { rows: Saved[] };
    const flagged = broken.rows.find((row) => row.persistent_candidate === true)!;
    flagged.top20_frequencies![0].frequency = 0.1;
    const rebound = bindCopy({
      view: rule,
      inputs,
      lists: [parseWith(resultsResponse, broken, "broken"), ...lists.filter((l) => l.run.rule_id !== rule)],
    });
    const drawn = frequencyPlot(rebound.schools, rule, rebound.copy.persistenceTest(rule))!;
    expect(drawn.undrawn.map((s) => s.id)).toContain(flagged.school.school_key);
    expect(drawn.rows[0].flat().map((s) => s.id)).not.toContain(flagged.school.school_key);
  });

  it("counts the schools the list flags", () => {
    for (const rule of ["additive_no_u", "additive_u"] as const) {
      const plot = frequencyPlot(bound.schools, rule, bound.copy.persistenceTest(rule))!;
      const flags = savedRows(rule).filter(
        (row) => row.cohort !== "verification_queue" && row.persistent_candidate === true
      );
      expect(flags.length, rule).toBeGreaterThan(0);
      expect(plot.persistent, rule).toBe(flags.length);
    }
  });
});
