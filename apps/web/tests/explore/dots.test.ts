/**
 * Where the explore charts put each dot (lib/explore/dots.ts). Failure modes, each with the test that catches it:
 *  1. A dot strays into a neighbouring band, so a school reads as recording a neighbour's figure
 *                                                   -> "keeps every dot inside its own band"
 *  2. A dot at either end of the axis leaves the plot  -> "keeps every dot inside its own band", at the first and last
 *  3. Tied records, which share a band, overlap and hide each other
 *                                                   -> "never overlaps two dots, and fills rows from the baseline up"
 *  4. Bands hold different numbers of dots per row, so a taller column can hold fewer schools, or a few wide bands
 *     spread their dots along the axis as if the position inside a band meant something
 *                                                   -> "gives every band the same row ...", "holds a row to ..."
 *  5. Two neighbouring columns touch and read as one, or a plot narrower than one dot per band overlaps them
 *                                                   -> "keeps room between neighbouring columns", "shrinks the dots ..."
 *  6. An empty list or an empty band draws something, or stands taller than nothing
 *                                                   -> "draws nothing for nothing"
 */
import { describe, expect, it } from "vitest";

import { stackDots } from "@/lib/explore/dots";

const STYLE = { diameter: 8, gap: 2, gutter: 14 };
/** Positions are sums of fractions of a pixel, so they compare to a millionth of one. */
const ROOM = 1e-6;
const groupsOf = (...sizes: number[]) =>
  sizes.map((size, band) => Array.from({ length: size }, (_, i) => `${band}:${i}`));

/** Lengths and group sizes that cover wide bands, bands of one or two columns, ties of 60, and empty bands. */
const CASES = [
  { length: 326, sizes: [54, 11, 20, 11, 5, 23] },
  { length: 326, sizes: [0, 1, 0, 61, 0, 2, 0] },
  { length: 1040, sizes: [3, 60, 1, 0, 9] },
  { length: 47, sizes: [5, 5, 5] },
  { length: 20, sizes: [1, 4, 7] },
  { length: 9, sizes: [2, 2] },
];

describe("stackDots", () => {
  it("keeps every dot inside its own band, the first and the last included", () => {
    for (const { length, sizes } of CASES) {
      const stack = stackDots(groupsOf(...sizes), length, STYLE);
      const step = length / sizes.length;
      for (const dot of stack.dots) {
        const [band] = dot.item.split(":").map(Number);
        expect(dot.band).toBe(band);
        expect(dot.x - stack.diameter / 2, `${length} ${dot.item}`).toBeGreaterThanOrEqual(
          band * step - ROOM
        );
        expect(dot.x + stack.diameter / 2, `${length} ${dot.item}`).toBeLessThanOrEqual(
          (band + 1) * step + ROOM
        );
      }
      expect(stack.dots.length).toBe(sizes.reduce((a, b) => a + b, 0));
    }
  });

  it("never overlaps two dots, and fills rows from the baseline up", () => {
    for (const { length, sizes } of CASES) {
      const stack = stackDots(groupsOf(...sizes), length, STYLE);
      const pitch = stack.diameter + stack.gap;
      const { dots } = stack;
      for (let i = 0; i < dots.length; i += 1)
        for (let j = i + 1; j < dots.length; j += 1) {
          const apart = Math.max(Math.abs(dots[i].x - dots[j].x), Math.abs(dots[i].y - dots[j].y));
          expect(apart, `${length} ${dots[i].item} ${dots[j].item}`).toBeGreaterThanOrEqual(pitch - ROOM);
        }
      // Within a band, a later item never sits below an earlier one: the first item is on the baseline.
      for (const [band, size] of sizes.entries()) {
        const ys = dots.filter((d) => d.band === band).map((d) => d.y);
        if (size > 0) expect(ys[0]).toBeCloseTo(stack.diameter / 2, 9);
        for (let i = 1; i < ys.length; i += 1) expect(ys[i]).toBeGreaterThanOrEqual(ys[i - 1] - ROOM);
      }
    }
  });

  it("gives every band the same row, so a column holding more schools stands at least as tall", () => {
    const stack = stackDots(groupsOf(54, 11, 20, 11, 5, 23), 326, STYLE);
    const top = (band: number) => Math.max(...stack.dots.filter((d) => d.band === band).map((d) => d.y));
    // 326 / 6 bands, less the room between them, leaves 4 dots and their gaps a row, so 54 schools take 14 rows.
    expect(stack.columns).toBe(4);
    expect(stack.height).toBeCloseTo(14 * 10 - 2, 9);
    expect(top(0)).toBeGreaterThan(top(5));
    expect(top(5)).toBeGreaterThan(top(2));
    expect(top(2)).toBeGreaterThan(top(1));
    expect(top(1)).toBe(top(3));
    expect(top(3)).toBeGreaterThan(top(4));
  });

  it("holds a row to its most dots however wide the band, and still centres it", () => {
    const stack = stackDots(groupsOf(21, 1), 490, { ...STYLE, maxColumns: 10 });
    expect(stack.columns).toBe(10);
    const xs = stack.dots.filter((d) => d.band === 0).map((d) => d.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(9 * 10, 9);
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(122.5, 9);
    expect(stack.height).toBeCloseTo(3 * 10 - 2, 9);
  });

  it("centres each row on its band, the last row too when it is not full", () => {
    const stack = stackDots(groupsOf(7, 1), 200, STYLE);
    const centre = (band: number) => (band + 0.5) * 100;
    const rowsOf = (band: number) => {
      const rows = new Map<number, number[]>();
      for (const d of stack.dots.filter((dot) => dot.band === band))
        rows.set(d.y, [...(rows.get(d.y) ?? []), d.x]);
      return [...rows.values()];
    };
    for (const band of [0, 1])
      for (const xs of rowsOf(band))
        expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(centre(band), 9);
  });

  it("keeps room between neighbouring columns, so two never read as one", () => {
    for (const { length, sizes } of CASES) {
      const stack = stackDots(groupsOf(...sizes), length, STYLE);
      const step = length / sizes.length;
      const room = Math.min(STYLE.gutter, step * 0.4);
      for (let band = 0; band + 1 < sizes.length; band += 1) {
        const right = stack.dots.filter((d) => d.band === band).map((d) => d.x + stack.diameter / 2);
        const left = stack.dots.filter((d) => d.band === band + 1).map((d) => d.x - stack.diameter / 2);
        if (right.length && left.length)
          expect(Math.min(...left) - Math.max(...right), `${length} ${band}`).toBeGreaterThanOrEqual(
            room - ROOM
          );
      }
    }
  });

  it("shrinks the dots when a band is narrower than one, so neighbouring columns never overlap", () => {
    const stack = stackDots(groupsOf(2, 2), 9, STYLE);
    expect(stack.columns).toBe(1);
    expect(stack.diameter).toBeLessThan(STYLE.diameter);
    expect(stack.diameter).toBeCloseTo(4.5 * 0.6, 9);
  });

  it("draws nothing for nothing", () => {
    expect(stackDots([], 300, STYLE)).toMatchObject({ dots: [], height: 0 });
    expect(stackDots([[], [], []], 300, STYLE)).toMatchObject({ dots: [], height: 0 });
  });
});
