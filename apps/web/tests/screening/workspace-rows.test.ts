/**
 * Failure modes of how the list reads, run on the API's own responses where they cover the case:
 *  1. The incomplete records are grouped in an order other than the one the arrow keys follow, a heading that
 *     comes back later in the API's order makes a second group, or a row moves out of its arrival order.
 *  2. Grouped by what is missing, the commonest gap does not lead, or groups of one size swap from run to run.
 *  3. The range note sits somewhere other than just before the first range school.
 *  4. The tie sentence is missing when rows are tied, repeated, or shown with no tie.
 *  5. What changed names a school by id or name instead of by role, or names one that lacks a place under one of the
 *     two rules, or a school with an incomplete record (R13), or a school whose places do not move, which teaches
 *     nothing about what changed.
 */
import { describe, expect, it } from "vitest";

import { placedFromResults } from "@/lib/screening/copy";
import { splitRows } from "@/lib/screening/list";
import { type RowGroup, firstRangeIndex, groupRows, tieNoteAfter } from "@/lib/screening/workspace/rows";
import { exampleSchool } from "@/lib/screening/workspace/teaching";

import { results } from "./fixtures";

const ordered = (rule: string) => splitRows(results(rule).rows).ordered;

describe("groupRows", () => {
  const rows = [
    { key: "a", group: "Province B" },
    { key: "b", group: "Province A" },
    { key: "c", group: "Province B" },
    { key: "d", group: "Province C" },
    { key: "e", group: "Province A" },
    { key: "f", group: "Province B" },
  ];
  type Row = (typeof rows)[number];
  const shape = (groups: readonly RowGroup<Row>[]) =>
    groups.map((g) => `${g.heading}: ${g.rows.map((r) => r.key).join("")}`);

  it("keeps the order rows arrive in, merging a heading that comes back later", () => {
    expect(shape(groupRows(rows, (r) => r.group, false))).toEqual([
      "Province B: acf",
      "Province A: be",
      "Province C: d",
    ]);
  });

  it("puts the largest group first, ties by heading, and keeps the arrival order inside each group", () => {
    const tied = [...rows, { key: "g", group: "Province C" }];
    expect(shape(groupRows(tied, (r) => r.group, true))).toEqual([
      "Province B: acf",
      "Province A: be",
      "Province C: dg",
    ]);
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

  it("takes the range school whose possible positions move most, the first of any that tie", () => {
    // 11th to 18th becomes 10th to 17th, and 21st becomes 22nd: both move two places; Sample School 17 comes first.
    expect(name(exampleSchool(both, "additive_u", "additive_no_u"))).toBe("Sample School 17");
  });

  it("passes over a range school whose places do not move when another one moves", () => {
    // Sample School 18 is 12th to 19th under both; Sample School 19 goes from 12th to 20th to 12th to 19th.
    const two = both.filter((s) => s.name === "Sample School 18" || s.name === "Sample School 19");
    expect(name(exampleSchool(two, "additive_u", "additive_no_u"))).toBe("Sample School 19");
  });

  it("falls back to the school with a single position that moves most when no range school has both", () => {
    const completeOnly = both.filter((s) => s.cohort !== "interval");
    // 5th under one rule and 3rd under the other; the two schools above it keep their places.
    expect(name(exampleSchool(completeOnly, "additive_u", "additive_no_u"))).toBe("Sample School 12");
  });

  it("is none when no school has a place under the other rule", () => {
    const alone = placedFromResults(results("additive_no_u"));
    expect(exampleSchool(alone, "additive_u", "additive_no_u")).toBeNull();
  });
});
