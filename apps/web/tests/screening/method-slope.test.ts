/**
 * Failure modes of the compare chart's labels and geometry (robustness R4: labels cannot wrap):
 *  1. A long name overflows its column, or is cut where a known ending could have been shortened instead.
 *  2. A name with no break and no known ending runs past the chart; it must keep its start and its end.
 *  3. Labels in the compressed band overlap each other or fall off the bottom of the chart.
 *  4. Places past the full rows land inside them, or the chart draws a band when every place is a full row.
 */
import { describe, expect, it } from "vitest";

import { MIN_LABEL_SIZE, bandTicks, fitLabel, placeLabels, slopeFrame } from "@/lib/screening/method/slope";

// Every character is as wide as 0.6 of the type size: a fixed-width stand-in for the browser's measure.
const measure = (text: string, size: number) => [...text].length * size * 0.6;
const SUFFIXES = [[/\s+High School$/i, " HS"]] as const;

describe("fitLabel", () => {
  it("keeps a name that fits whole, at the base size", () => {
    expect(fitLabel("Hillside School", "  1", 200, 12, 400, measure, SUFFIXES)).toEqual({
      text: "Hillside School",
      size: 12,
      shortened: false,
    });
  });

  it("shortens a known ending before it shrinks, and shrinks before it cuts (1)", () => {
    const name = "Riverbend Catholic High School";
    const fitted = fitLabel(name, "  3", 150, 12, 400, measure, SUFFIXES);
    expect(fitted.text).toBe("Riverbend Catholic HS");
    expect(fitted.shortened).toBe(true);
    expect(measure(fitted.text + "  3", fitted.size)).toBeLessThanOrEqual(150);
  });

  it("cuts an unbreakable name in the middle, keeping its start and end, within the column (2)", () => {
    const name = "Unbroken".repeat(8).slice(0, 59);
    const fitted = fitLabel(name, "  12", 110, 12, 400, measure, SUFFIXES);
    expect(fitted.size).toBe(MIN_LABEL_SIZE);
    expect(fitted.text.startsWith("Unbro")).toBe(true);
    expect(fitted.text.endsWith(name.slice(-3))).toBe(true);
    expect(measure(fitted.text + "  12", fitted.size)).toBeLessThanOrEqual(110);
  });
});

describe("placeLabels", () => {
  it("keeps labels at least the gap apart and inside the chart (3)", () => {
    const items = [{ y: 100 }, { y: 101 }, { y: 102 }, { y: 195 }, { y: 199 }];
    const placed = placeLabels(items, 90, 200, 12);
    const ys = placed.map((p) => p.ly);
    for (let i = 1; i < ys.length; i += 1) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(12);
    expect(Math.max(...ys)).toBeLessThanOrEqual(200);
  });
});

describe("slopeFrame", () => {
  it("draws places past k in the band below the full rows (4)", () => {
    const frame = slopeFrame(10, 100);
    expect(frame.y(10)).toBeLessThan(frame.zoneTop);
    expect(frame.y(11)).toBeGreaterThan(frame.zoneTop);
    expect(frame.y(100)).toBeLessThan(frame.height);
    expect(bandTicks(10, 100)).toEqual([11, 20, 40, 60, 80, 100]);
  });

  it("draws no band when every place is a full row (4)", () => {
    const frame = slopeFrame(20, 16);
    expect(frame.height).toBe(frame.zoneTop + 6);
    expect(frame.y(16)).toBeLessThan(frame.zoneTop);
    expect(bandTicks(20, 16)).toEqual([]);
  });
});
