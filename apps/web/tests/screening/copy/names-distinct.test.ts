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

import { bindCopy, copyFor, distinctName, namesIn } from "@/lib/screening/copy";
import { parseWith } from "@/lib/screening/schema";
import { compareResponse, inputsResponse, resultsResponse } from "@/lib/screening/types";

import { copy as clone, readFixture } from "../fixtures";
import { school } from "./helpers";

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

describe("a list that changes after a name was asked for", () => {
  const twin = (id: string, name: string, district: string) =>
    school({ id, name, district, province: "Highlands" });

  it("names a school by the list as it is now, for a list changed in place", () => {
    const list = [twin("a", "Twin School", "North"), twin("b", "Another", "South")];
    expect(distinctName(list[0], list)).toBe("Twin School");
    list.push(twin("c", "Twin  School", "East"));
    expect(distinctName(list[0], list)).toBe("Twin School (North)");
    list[2] = { ...list[2], name: "Third" };
    expect(distinctName(list[0], list)).toBe("Twin School");
    list.length = 0;
    expect(distinctName(twin("z", "Solo", "North"), list)).toBe("Solo");
  });

  it("binds a snapshot of the schools, so a list changed afterwards does not change what the copy says", () => {
    const list = [twin("a", "Twin School", "North"), twin("b", "Twin  School", "East")];
    const bound = copyFor({ schools: list, countsByRule: "shared" });
    const before = bound.tieNote(list[0], "additive_u");
    list.length = 0;
    expect(bound.distinctName(twin("a", "Twin School", "North"))).toBe("Twin School (North)");
    expect(bound.tieNote(list[0] ?? twin("a", "Twin School", "North"), "additive_u")).toBe(before);
  });
});

describe("naming every school of a long list that is not frozen", () => {
  const long = Array.from({ length: 6000 }, (_, i) =>
    school({ id: `s${i}`, name: `School ${i}`, district: "North", province: "Highlands" })
  );

  // Rebuilding the index on every call costs one name clean per school per call: 36 million for this list, which
  // takes several seconds. Keeping it between calls takes well under one.
  it("keeps the index between calls instead of rebuilding it for each school", () => {
    const started = performance.now();
    for (const s of long) distinctName(s, long);
    expect(performance.now() - started).toBeLessThan(1500);
  });

  it("still sees a school renamed or added after the index was kept", () => {
    const list = long.slice(0, 50);
    expect(distinctName(list[0], list)).toBe("School 0");
    list[1] = { ...list[1], name: "School 0" };
    expect(distinctName(list[0], list)).toBe("School 0 (record s0)");
    list.push({ ...list[2], id: "extra", name: "School 0" });
    expect(distinctName(list[0], list)).toBe("School 0 (record s0)");
    list.pop();
    list[1] = long[1];
    expect(distinctName(list[0], list)).toBe("School 0");
  });
});
