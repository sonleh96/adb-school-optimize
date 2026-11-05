/**
 * The province bars' colours, read from their stylesheet (components/explore/sections/province.module.css). Failure
 * modes, each with the test that catches it:
 *  1. A bar's colour drifts from the map's, so the same school reads one way on the map and another here: the top 20
 *     and the rest of the list are the even ramp's two ends, the records not in the list yet the empty ring's grey
 *                                                    -> "are the map's own colours"
 *  2. A bar falls under 3:1 on the card, or the top 20 under 3:1 against the rest of the list, so its part cannot be
 *     told apart by colour; or the top 20's count inside its part under 4.5:1
 *                                                    -> "keep 3:1 on the card and against each other ..."
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { contrastRatio } from "@/lib/screening/contrast";
import { INCOMPLETE_RING_HEX, RAMP_HEX } from "@/lib/screening/marks";

const tokensOf = (file: string): Record<string, string> =>
  Object.fromEntries(
    [
      ...readFileSync(path.resolve(__dirname, "../..", file), "utf8").matchAll(
        /--([\w-]+):\s*(#[0-9a-f]{3,6})\b/gi
      ),
    ].map((m) => [m[1], m[2].toLowerCase()])
  );
const BARS = tokensOf("components/explore/sections/province.module.css");
/** The card the bars sit on, the explore page's panel, written out in full for the contrast check. */
const PANEL = tokensOf("components/explore/explore.module.css").panel.replace(
  /^#(\w)(\w)(\w)$/,
  "#$1$1$2$2$3$3"
);

describe("the province bars' colours", () => {
  it("are the map's own colours", () => {
    expect(BARS["bar-top"]).toBe(RAMP_HEX[0].toLowerCase());
    expect(BARS["bar-list"]).toBe(RAMP_HEX[RAMP_HEX.length - 1].toLowerCase());
    expect(BARS["bar-waiting"]).toBe(INCOMPLETE_RING_HEX.toLowerCase());
  });

  it("keep 3:1 on the card and against each other, and the top 20's count 4.5:1 on its part", () => {
    for (const bar of ["bar-top", "bar-list", "bar-waiting"])
      expect(contrastRatio(BARS[bar], PANEL), bar).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(BARS["bar-top"], BARS["bar-list"])).toBeGreaterThanOrEqual(3);
    expect(contrastRatio("#ffffff", BARS["bar-top"])).toBeGreaterThanOrEqual(4.5);
  });
});
