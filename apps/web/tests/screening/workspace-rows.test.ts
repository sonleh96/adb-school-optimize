/**
 * Failure modes of how the list reads, run on the API's own responses where they cover the case:
 *  1. Two rows show the same bare place with two meanings (R19): under a need-first rule a range school whose ends
 *     meet sits beside a complete school with the same number, and the scope detail stays hidden.
 *  2. The scope detail opens by itself on a list that has no such collision, hiding Read more for no reason.
 *  3. The range note sits somewhere other than just before the first range school.
 *  4. The tie sentence is missing when rows are tied, repeated, or shown with no tie.
 *  5. What changed names a school by id or name instead of by role, or names one that lacks a place under one of the
 *     two rules, or a school with an incomplete record (R13), or a school whose places do not move, which teaches
 *     nothing about what changed.
 */
import { describe, expect, it } from "vitest";

import { placedFromResults } from "@/lib/screening/copy";
import { splitRows } from "@/lib/screening/list";
import { firstRangeIndex, placeForm, scopesMix, tieNoteAfter } from "@/lib/screening/workspace/rows";
import { exampleSchool } from "@/lib/screening/workspace/teaching";

import { results } from "./fixtures";

const ordered = (rule: string) => splitRows(results(rule).rows).ordered;

describe("scopesMix", () => {
  it("is true when a range school's single place repeats a complete school's place", () => {
    const rows = ordered("need_first_u");
    // The fixture's need-first list has a range school at exactly 10th and a complete school at 10th.
    const tenth = rows.filter(
      (r) => placeForm(r).kind === "scoped" || (r.cohort === "complete" && r.point_rank.rank === 10)
    );
    expect(tenth.map((r) => r.school.source_school_name)).toEqual(
      expect.arrayContaining(["Sample School 17", "Sample School 07"])
    );
    expect(scopesMix(rows)).toBe(true);
  });

  it("is false when a range school's single place is a number no complete school shows", () => {
    // Under the main rule one range school sits at exactly 21st, past the 16 complete schools.
    const rows = ordered("additive_u");
    expect(rows.filter((r) => placeForm(r).kind === "scoped")).toHaveLength(1);
    expect(scopesMix(rows)).toBe(false);
  });
});

describe("where the list's notes go", () => {
  it("puts the range note before the first range school", () => {
    const rows = ordered("additive_u");
    const at = firstRangeIndex(rows);
    expect(rows[at].school.source_school_name).toBe("Sample School 17");
    expect(rows.slice(0, at).every((r) => r.cohort === "complete")).toBe(true);
    expect(firstRangeIndex(rows.filter((r) => r.cohort === "complete"))).toBe(-1);
  });

  it("puts the tie sentence once, after the first run of tied rows", () => {
    expect(tieNoteAfter([false, true, true, false, true, true])).toBe(2);
    expect(tieNoteAfter([true, true])).toBe(1);
    expect(tieNoteAfter([false, false, false])).toBe(-1);
  });
});

describe("exampleSchool", () => {
  const both = placedFromResults(results("additive_no_u"), results("additive_u"));

  const name = (school: { name: string | null } | null) => school?.name ?? null;

  it("takes the range school whose possible places move most, the first of any that tie", () => {
    // 11th to 18th becomes 10th to 17th, and 21st becomes 22nd: both move two places; Sample School 17 comes first.
    expect(name(exampleSchool(both, "additive_u", "additive_no_u"))).toBe("Sample School 17");
  });

  it("passes over a range school whose places do not move when another one moves", () => {
    // Sample School 18 is 12th to 19th under both; Sample School 19 goes from 12th to 20th to 12th to 19th.
    const two = both.filter((s) => s.name === "Sample School 18" || s.name === "Sample School 19");
    expect(name(exampleSchool(two, "additive_u", "additive_no_u"))).toBe("Sample School 19");
  });

  it("falls back to the school with a single place that moves most when no range school has both", () => {
    const completeOnly = both.filter((s) => s.cohort !== "interval");
    // 5th under one rule and 3rd under the other; the two schools above it keep their places.
    expect(name(exampleSchool(completeOnly, "additive_u", "additive_no_u"))).toBe("Sample School 12");
  });

  it("is none when no school has a place under the other rule", () => {
    const alone = placedFromResults(results("additive_no_u"));
    expect(exampleSchool(alone, "additive_u", "additive_no_u")).toBeNull();
  });
});
