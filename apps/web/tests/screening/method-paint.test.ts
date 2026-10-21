/**
 * Failure modes of the map's paint in compare mode:
 *  1. A school with a single place under the rule shown but outside the group both rules put in order has no move,
 *     so its dot falls back to the place ramp, and one colour scale on the map means two different things.
 *  2. The neutral colour is one of the move colours, so an outside school reads as a school that did not move.
 */
import { describe, expect, it } from "vitest";

import { compareFor } from "@/lib/screening/method/compare";
import { MOVE_HEX, OUTSIDE_HEX } from "@/lib/screening/method/moves";
import { paintFor } from "@/lib/screening/method/paint-for";
import { parseWith } from "@/lib/screening/schema";
import { type RuleId, compareResponse } from "@/lib/screening/types";

import { readFixture, results } from "./fixtures";

describe("compare mode's map colours", () => {
  // The benchmark puts 21 schools in order with a single place; 16 of them are in order under both rules.
  const pair = parseWith(compareResponse, readFixture("compare/additive_u__benchmark.json"), "compare");
  const compared = compareFor(pair, "additive_u" as RuleId, "benchmark" as RuleId, 20);
  const rows = results("benchmark").rows;
  const paint = paintFor({ hide: [], rows, filters: { prov: null, loc: null }, compared, edges: [4, 14] });

  it("gives every dot a colour from the comparison, and the schools outside it one neutral colour (1)", () => {
    const dots = rows.filter((r) => r.cohort === "complete").map((r) => r.school.school_key);
    expect(dots).toHaveLength(21);
    const outside = dots.filter((key) => !compared.rows.some((r) => r.key === key));
    expect(outside).toHaveLength(5);
    for (const key of dots) expect(paint.moves?.has(key), key).toBe(true);
    for (const key of outside) expect(paint.moves?.get(key)).toEqual({ hex: OUTSIDE_HEX, top: false });
  });

  it("keeps the neutral colour apart from every move colour (2)", () => {
    expect(MOVE_HEX).not.toContain(OUTSIDE_HEX);
  });
});
