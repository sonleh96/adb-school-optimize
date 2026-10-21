/**
 * Failure modes of what the map draws:
 *  1. A school appears as the wrong mark: a range school as a dot, an incomplete record as a place.
 *  2. The place ramp steps at the wrong places (10th/11th, 20th/21st, 40th/41st, 80th/81st).
 *  3. A school without coordinates reaches the map layer, which cannot draw it, or is dropped from the list.
 *  4. The first view frames the wrong area because of a school that has no position.
 *  5. A mark fades into the basemap: every mark must keep 3:1 against the land and the water.
 *  6. The tooltip names a place without the scope it was counted in.
 */
import { describe, expect, it } from "vitest";

import { contrastRatio } from "@/lib/screening/contrast";
import {
  INCOMPLETE_RING_HEX,
  LAND_COLOUR,
  RAMP_HEX,
  RANGE_RING_HEX,
  WATER_COLOUR,
  boundsOf,
  markOf,
  rampStep,
  toMapSchools,
} from "@/lib/screening/marks";

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

describe("contrast", () => {
  it("is 21 for black on white, 1 for equal colours, and does not depend on the order", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#336699", "#336699")).toBe(1);
  });

  it.each(RAMP_HEX.map((hex, step) => [step, hex] as const))(
    "ramp step %i keeps 3:1 on land and water",
    (_s, hex) => {
      expect(contrastRatio(hex, LAND_COLOUR)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(hex, WATER_COLOUR)).toBeGreaterThanOrEqual(3);
    }
  );

  it("keeps 3:1 for the range ring and the incomplete ring", () => {
    for (const ring of [RANGE_RING_HEX, INCOMPLETE_RING_HEX]) {
      expect(contrastRatio(ring, LAND_COLOUR)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(ring, WATER_COLOUR)).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the ramp ordered from dark to light, so a better place is the darker mark", () => {
    const ratios = RAMP_HEX.map((hex) => contrastRatio(hex, LAND_COLOUR));
    expect([...ratios].sort((a, b) => b - a)).toEqual(ratios);
  });
});

describe("markOf", () => {
  const rows = results("additive_u").rows;
  const mark = (name: string) => markOf(rows.find((row) => row.school.source_school_name === name)!);

  it("is a dot with the place for a complete school", () => {
    expect(mark("Sample School 08")).toEqual({ kind: "dot", rank: 1, step: 0 });
    expect(mark("Sample School 14")).toEqual({ kind: "dot", rank: 16, step: 1 });
  });

  it("is a range mark for an interval school, even when its ends are equal, and an incomplete mark for a queued one", () => {
    expect(mark("Sample School 17")).toEqual({ kind: "range" });
    expect(mark("Sample School 25")).toEqual({ kind: "range" });
    expect(mark("Sample School 21")).toEqual({ kind: "incomplete" });
  });
});

describe("toMapSchools", () => {
  const rows = results("additive_u").rows;

  it("leaves out the two schools without coordinates and keeps the list's order", () => {
    const schools = toMapSchools(rows);
    expect(schools).toHaveLength(23);
    const missing = rows
      .filter((row) => !schools.some((s) => s.key === row.school.school_key))
      .map((row) => row.school.source_school_name);
    expect(missing).toEqual(["Sample School 05", "Sample School 22"]);
    expect(schools.slice(0, 2).map((s) => s.name)).toEqual(["Sample School 08", "Sample School 15"]);
  });

  it("carries the place, its scope and whether a range is exact, for the tooltip", () => {
    const schools = toMapSchools(rows);
    const school = (name: string) => schools.find((s) => s.name === name)!;
    expect(school("Sample School 17")).toMatchObject({
      place: "11th to 18th",
      scope: "eligible (21)",
      exact: false,
    });
    expect(school("Sample School 25")).toMatchObject({ place: "21st", scope: "eligible (21)", exact: true });
    expect(school("Sample School 08")).toMatchObject({
      place: "1st",
      scope: "complete under this rule (16)",
      exact: false,
    });
    expect(school("Sample School 21")).toMatchObject({ place: "", scope: null, exact: false });
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
