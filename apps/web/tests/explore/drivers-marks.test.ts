/**
 * The colours of the drivers section's bars, read from its stylesheet. Failure modes, each with the test that catches it:
 *  1. A part of school need takes a colour off the map's even navy ramp, or two parts share one
 *                                          -> "the parts of school need take the ramp's five steps, one each"
 *  2. Two parts that sit side by side in a bar are one ramp step apart, so they look alike
 *                                          -> "neighbouring parts sit at least two steps apart"
 *  3. A mark falls under 3:1 on the white card, or the hollow of a figure not recorded is not the map's range ring
 *                                          -> "every mark keeps 3:1 on the card"
 *  4. The two parts on the ramp's two darkest steps, one step apart, can be told apart only by colour, so a reader
 *     cannot match a dark segment to its key -> "the two darkest parts differ by a hatch, on the key and in the bar"
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
const SHEET = css("components/explore/sections/drivers.module.css");
const DRIVERS = tokens(SHEET);
/** Each rule's selectors and body, so a part's whole look can be read off its selectors. */
const RULES = [...SHEET.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  selectors: m[1].split(",").map((x) => x.trim()),
  body: m[2],
}));
/** The hatch a part wears on one kind of mark, or null: the gradient its rule draws over the part's colour. */
const hatchOf = (mark: "seg" | "swatch", piece: string): string | null =>
  RULES.find((r) => r.selectors.includes(`.${mark}[data-piece="${piece}"]`))?.body.match(
    /background-image:\s*(repeating-linear-gradient\([^;]+\))/
  )?.[1] ?? null;
const PIECES = [
  "permanent_classroom_deficit",
  "teacher_housing_deficit",
  "facility_presence_deficit",
  "service_deficit",
  "locality_disadvantage",
];
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

  it("the two darkest parts differ by a hatch, on the key and in the bar, and the hatch shows on its part", () => {
    const darkest = [0, 1].map((step) => PIECES[NEED.indexOf(RAMP[step])]);
    const hatched = darkest.filter((piece) => hatchOf("seg", piece) !== null);
    expect(hatched, "exactly one of the two darkest parts is hatched").toHaveLength(1);
    const [piece] = hatched;
    // The key wears the same hatch as the bar, so a reader can match them.
    expect(hatchOf("swatch", piece)).toBe(hatchOf("seg", piece));
    const part = NEED[PIECES.indexOf(piece)];
    expect(contrastRatio(DRIVERS["part-hatch"], part)).toBeGreaterThanOrEqual(3);
  });
});
