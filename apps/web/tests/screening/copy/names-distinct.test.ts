/**
 * A name that enters a sentence tells its school from every other in the same list.
 *
 * Failure modes, each with the test that catches it:
 *  1. Two schools whose names differ only in spacing read the same in a list of names, so a reader cannot tell
 *     which is which.
 *  2. A name made of zero-width characters is an invisible name in a comparison.
 * The records are the API's own worst-case names: two schools named "Spaced Name School" apart from spacing, and
 * one whose name is a zero-width space. The comparison's changes are those schools moved across the top 10 and
 * the top 20, which is what the API sends when they move.
 */
import { describe, expect, it } from "vitest";

import { bindCopy, namesIn } from "@/lib/screening/copy";
import { parseWith } from "@/lib/screening/schema";
import { compareResponse, inputsResponse, resultsResponse } from "@/lib/screening/types";

import { copy as clone, readFixture } from "../fixtures";

const D = "worst-names";
type Row = {
  school: { source_school_name: string };
  point_rank: { rank: number };
  rank_bounds: { best: number; worst: number };
};
const list = (rule: string) => clone(readFixture(`results/${rule}.json`, D)) as { rows: Row[] };
const rankOf = (rows: Row[], name: string) => rows.find((r) => r.school.source_school_name === name) as Row;

/** The second list with the twin and the unnamed school pushed out of, and into, the top 10. */
function lists() {
  const a = list("additive_u");
  const b = list("additive_no_u");
  const swap = (x: string, y: string) => {
    const [rx, ry] = [rankOf(b.rows, x), rankOf(b.rows, y)];
    for (const field of ["rank", "best", "worst"] as const) {
      const key = field === "rank" ? rx.point_rank : rx.rank_bounds;
      const other = field === "rank" ? ry.point_rank : ry.rank_bounds;
      const k = field as never;
      [(key as never)[k], (other as never)[k]] = [(other as never)[k], (key as never)[k]];
    }
  };
  swap("Spaced Name School", "Worst Case 10");
  swap("\u200b", "Worst Case 08");
  swap("Spaced  Name School", "Worst Case 02");
  return [a, b].map((x, i) => parseWith(resultsResponse, x, i ? "no_u" : "u"));
}

function compare() {
  const c = clone(readFixture("compare/additive_u__additive_no_u.json", D)) as {
    entrants: unknown[];
    exits: unknown[];
    ranks: { school: { source_school_name: string } }[];
  };
  const found = (name: string) =>
    c.ranks.find((r) => r.school.source_school_name === name) as { school: unknown };
  const change = (status: string, name: string, a: number, b: number) => ({
    ...found(name),
    status,
    rank_a: a,
    rank_b: b,
    rank_scope: "Common complete cohort",
    rank_scope_code: "common_complete_cohort",
  });
  c.entrants = [change("entrant", "Spaced  Name School", 12, 8), change("entrant", "\u200b", 15, 9)];
  c.exits = [change("exit", "Spaced Name School", 4, 14)];
  return parseWith(compareResponse, c, "compare");
}

const inputs = parseWith(inputsResponse, readFixture("inputs.json", D), "inputs");
const { copy: P, schools } = bindCopy({ view: "additive_u", inputs, lists: lists(), compare: compare() });

describe("a list of names", () => {
  const segments = P.segments.listStartsSentence(undefined, "additive_u", 17);

  it("tells two schools apart whose names differ only in spacing, and names the unnamed one", () => {
    const names = namesIn(segments);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("Spaced Name School (North Two)");
    expect(names).toContain("Spaced Name School (North One)");
    expect(names).toContain("Unnamed school");
  });
});

describe("the schools that move in a comparison", () => {
  for (const top of [10, 20]) {
    it(`names each one once and never as an invisible name, among the top ${top}`, () => {
      const segs = P.segments.comparisonSentence("additive_u", "additive_no_u", undefined, { top });
      const names = namesIn(segs);
      expect(names.length).toBeGreaterThan(1);
      expect(new Set(names).size).toBe(names.length);
      for (const name of names) expect(name).toMatch(/[^\s\p{Cf}]/u);
      expect(P.comparisonSentence("additive_u", "additive_no_u", undefined, { top })).not.toMatch(/\p{Cf}/u);
    });
  }

  it("keeps the schools the comparison names among the schools of the list", () => {
    expect(schools.map((s) => s.name)).toContain("Spaced Name School");
  });
});
