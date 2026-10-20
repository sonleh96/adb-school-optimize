/**
 * Failure modes of what the map draws:
 *  1. A school appears as the wrong mark: a range school as a dot, an incomplete record as a place.
 *  2. The place ramp steps at the wrong places (10th/11th, 20th/21st, 40th/41st, 80th/81st).
 *  3. A school without coordinates reaches the map layer, which cannot draw it, or is dropped from the list.
 *  4. The first view frames the wrong area because of a school that has no position.
 */
import { describe, expect, it } from "vitest";

import { boundsOf, markOf, rampStep, toMapSchools } from "@/lib/screening/marks";

import { results } from "./fixtures";

describe("rampStep", () => {
  it.each([
    [1, 0],
    [10, 0],
    [11, 1],
    [20, 1],
    [21, 2],
    [40, 2],
    [41, 3],
    [80, 3],
    [81, 4],
    [120, 4],
    [500, 4],
  ])("place %i is step %i", (rank, step) => {
    expect(rampStep(rank)).toBe(step);
  });
});

describe("markOf", () => {
  const rows = results("additive_u").rows;
  const mark = (name: string) => markOf(rows.find((row) => row.school.source_school_name === name)!);

  it("is a dot with the place for a complete school", () => {
    expect(mark("Sample School 08")).toEqual({ kind: "dot", rank: 1, step: 0 });
    expect(mark("Sample School 14")).toEqual({ kind: "dot", rank: 16, step: 1 });
  });

  it("is a range mark for an interval school and an incomplete mark for a queued one", () => {
    expect(mark("Sample School 17")).toEqual({ kind: "range" });
    expect(mark("Sample School 21")).toEqual({ kind: "incomplete" });
  });
});

describe("toMapSchools", () => {
  const rows = results("additive_u").rows;

  it("leaves out the two schools without coordinates and keeps the list's order", () => {
    const schools = toMapSchools(rows);
    expect(schools).toHaveLength(22);
    const missing = rows
      .filter((row) => !schools.some((s) => s.key === row.school.school_key))
      .map((row) => row.school.source_school_name);
    expect(missing).toEqual(["Sample School 05", "Sample School 22"]);
    expect(schools.slice(0, 2).map((s) => s.name)).toEqual(["Sample School 08", "Sample School 15"]);
  });

  it("carries the place text the tooltip shows", () => {
    const schools = toMapSchools(rows);
    expect(schools.find((s) => s.name === "Sample School 17")?.place).toBe("11th to 18th");
    expect(schools.find((s) => s.name === "Sample School 21")?.place).toBe("");
  });
});

describe("boundsOf", () => {
  it("spans the drawn schools only", () => {
    const schools = toMapSchools(results("additive_u").rows);
    const bounds = boundsOf(schools)!;
    expect(bounds[0][0]).toBe(Math.min(...schools.map((s) => s.lon)));
    expect(bounds[1][1]).toBe(Math.max(...schools.map((s) => s.lat)));
  });

  it("is nothing when no school can be drawn", () => {
    expect(boundsOf([])).toBeNull();
  });
});
