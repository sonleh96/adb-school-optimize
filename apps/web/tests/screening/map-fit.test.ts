/**
 * Failure modes of the map's fit:
 *  1. A fit asks for more room than the map has (the panels' padding on an axis is wider than the map, as while the
 *     rail opens), so MapLibre skips it with a warning and the country is not framed.
 *  2. Clamping changes a fit that already holds, or leaves no clear part to frame into.
 *  3. Centring a school in the clear part leaves the map's own padding set, so a later fit counts it twice; the
 *     offset that replaces it must put the school in the middle of the clear part.
 */
import { describe, expect, it } from "vitest";

import { MIN_CLEAR, clearCentreOffset, fitPadding } from "@/lib/screening/workspace/layout";

describe("the padding a fit asks for", () => {
  it("is left alone when the map can hold it", () => {
    const padding = { top: 80, right: 448, bottom: 300, left: 56 };
    expect(fitPadding(padding, 1288, 1000)).toEqual(padding);
  });

  it("shrinks both sides of an axis in proportion when they leave less than the least clear part", () => {
    expect(fitPadding({ top: 80, right: 448, bottom: 300, left: 472 }, 800, 1000)).toEqual({
      top: 80,
      right: 358,
      bottom: 300,
      left: 377,
    });
    const tall = fitPadding({ top: 80, right: 64, bottom: 900, left: 56 }, 1288, 700);
    expect(tall.top + tall.bottom).toBeLessThanOrEqual(700 - MIN_CLEAR);
  });

  it("asks for nothing on a map smaller than the least clear part", () => {
    expect(fitPadding({ top: 80, right: 64, bottom: 140, left: 56 }, 40, 50)).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
  });
});

describe("centring a school in the clear part", () => {
  it("offsets it from the map's centre to the clear part's centre", () => {
    // A 1288 by 1000 map with the card on the right: the clear part runs from 56 to 840 across and 80 to 700 down,
    // whose centre (448, 390) is (-196, -110) from the map's centre (644, 500).
    expect(clearCentreOffset({ top: 80, right: 448, bottom: 300, left: 56 })).toEqual([-196, -110]);
  });
});
