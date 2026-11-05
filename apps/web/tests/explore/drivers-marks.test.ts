/**
 * The colours of the drivers section's bars, read from its stylesheet. Failure modes, each with the test that catches it:
 *  1. A part of school need takes a colour off the map's even navy ramp, or two parts share one
 *                                          -> "the parts of school need take the ramp's five steps, one each"
 *  2. Two parts that sit side by side in a bar are one ramp step apart, so they look alike
 *                                          -> "neighbouring parts sit at least two steps apart"
 *  3. A mark falls under 3:1 on the white card, or the hollow of a figure not recorded is not the map's range ring
 *                                          -> "every mark keeps 3:1 on the card"
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { contrastRatio } from "@/lib/screening/contrast";
import { RAMP_HEX, RANGE_RING_HEX } from "@/lib/screening/marks";

const css = (file: string) => readFileSync(path.resolve(__dirname, "../..", file), "utf8");
const tokens = (text: string): Record<string, string> =>
  Object.fromEntries(
    [...text.matchAll(/--([\w-]+):\s*(#[0-9a-f]{3,6})\b/gi)].map((m) => [m[1], m[2].toLowerCase()])
  );
const DRIVERS = tokens(css("components/explore/sections/drivers.module.css"));
const PAGE = tokens(css("components/explore/explore.module.css"));
const PANEL = PAGE.panel === "#fff" ? "#ffffff" : PAGE.panel;
const RAMP = RAMP_HEX.map((hex) => hex.toLowerCase());
/** The five parts in the order a bar draws them: the engine's order of school need's parts. */
const NEED = ["classrooms", "housing", "facilities", "services", "locality"].map(
  (part) => DRIVERS[`part-${part}`]
);

describe("the drivers section's colours", () => {
  it("the parts of school need take the ramp's five steps, one each", () => {
    expect([...NEED].sort()).toEqual([...RAMP].sort());
  });

  it("neighbouring parts sit at least two steps apart on the ramp", () => {
    const steps = NEED.map((hex) => RAMP.indexOf(hex));
    for (let i = 1; i < steps.length; i++)
      expect(Math.abs(steps[i] - steps[i - 1]), `${i}`).toBeGreaterThanOrEqual(2);
  });

  it("every mark keeps 3:1 on the card, and a figure not recorded is ringed as the map rings a range", () => {
    for (const hex of [...NEED, DRIVERS["part-other"], DRIVERS["part-open"], PAGE["navy-2"]])
      expect(contrastRatio(hex, PANEL), hex).toBeGreaterThanOrEqual(3);
    expect(DRIVERS["part-open"]).toBe(RANGE_RING_HEX.toLowerCase());
  });
});
