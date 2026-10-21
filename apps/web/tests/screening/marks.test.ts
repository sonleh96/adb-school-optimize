/**
 * Failure modes of what the map draws:
 *  1. A school appears as the wrong mark: a range school as a dot, an incomplete record as a place.
 *  2. A dot's colour step is not its band of the list's own places (the bands are tested in workspace-layout).
 *  3. A school without coordinates reaches the map layer, which cannot draw it, or is dropped from the list.
 *  4. The first view frames the wrong area because of a school that has no position.
 *  5. A mark fades into the basemap: every mark must keep 3:1 against the land and the water.
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
  bandsOf,
  markOf,
  toMapSchools,
} from "@/lib/screening/marks";

import { results } from "./fixtures";

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
  const mark = (name: string) =>
    markOf(
      rows.find((row) => row.school.source_school_name === name)!,
      bandsOf(rows)
    );

  it("is a dot with the place and its band of the list's 16 places for a complete school", () => {
    expect(mark("Sample School 08")).toEqual({ kind: "dot", rank: 1, step: 0 });
    expect(mark("Sample School 09")).toEqual({ kind: "dot", rank: 10, step: 0 });
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
    expect(schools.slice(0, 2).map((s) => s.key)).toEqual([
      rows[0].school.school_key,
      rows[1].school.school_key,
    ]);
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
