/**
 * Failure modes of the place numbers' layout when dots crowd:
 *  1. Numbers that collide with nothing move anyway, so a calm map grows leaders it does not need.
 *  2. Of two colliding numbers the earlier place moves, so the first place leaves its dot.
 *  3. In a dense crowd two numbers still overlap, or a moved number lands on another numbered dot's centre.
 *  4. A number is dropped, or moved so far it reads as nobody's.
 *  5. A number near the map's edge is moved off the map.
 */
import { describe, expect, it } from "vitest";

import { NUMBER_DISC, type NumberPoint, layOutNumbers } from "@/lib/screening/rank-labels";

const drawnAt = (points: readonly NumberPoint[], width = 390, height = 460) => {
  const spots = layOutNumbers(points, width, height);
  return spots.map((spot) => {
    const point = points.find((p) => p.rank === spot.rank)!;
    return { ...spot, x: point.x + spot.dx, y: point.y + spot.dy, dot: point };
  });
};

describe("layOutNumbers", () => {
  it("leaves every number on its dot when no two collide", () => {
    const points = [
      { rank: 1, x: 100, y: 100 },
      { rank: 2, x: 118, y: 100 },
      { rank: 3, x: 100, y: 118 },
    ];
    expect(layOutNumbers(points, 390, 460).map(({ dx, dy }) => [dx, dy])).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
    ]);
  });

  it("moves the later of two colliding places and keeps the earlier on its dot, whatever order they come in", () => {
    const spots = layOutNumbers(
      [
        { rank: 9, x: 200, y: 200 },
        { rank: 7, x: 206, y: 203 },
      ],
      390,
      460
    );
    expect(spots.map((s) => s.rank)).toEqual([7, 9]);
    expect(spots[0]).toMatchObject({ dx: 0, dy: 0 });
    const moved = Math.hypot(spots[1].dx, spots[1].dy);
    expect(moved).toBeGreaterThanOrEqual(NUMBER_DISC);
    // It moves away from the 7th, to the 9th's side: the 9th's dot is left of the 7th's.
    expect(spots[1].dx).toBeLessThan(0);
  });

  it("keeps all ten numbers of a dense crowd apart, off the other numbered dots, and within three discs of their own", () => {
    // Ten dots on a grid 4 px apart: tighter than any real map draws.
    const points = Array.from({ length: 10 }, (_, i) => ({
      rank: i + 1,
      x: 180 + 4 * (i % 4),
      y: 200 + 4 * Math.floor(i / 4),
    }));
    const drawn = drawnAt(points);
    expect(drawn).toHaveLength(10);
    for (const a of drawn) {
      expect(Math.hypot(a.dx, a.dy)).toBeLessThanOrEqual(3 * NUMBER_DISC);
      for (const b of drawn) {
        if (a === b) continue;
        // Their boxes do not meet: apart across, or apart down.
        expect(
          Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)),
          `${a.rank} and ${b.rank}`
        ).toBeGreaterThanOrEqual(NUMBER_DISC);
        if (a.dx || a.dy)
          expect(Math.hypot(a.x - b.dot.x, a.y - b.dot.y), `${a.rank} on ${b.rank}'s dot`).toBeGreaterThan(
            NUMBER_DISC / 2
          );
      }
    }
  });

  it("moves a number where it hides no other school's dot, and over one only when nothing else is near", () => {
    const pair = [
      { rank: 1, x: 200, y: 200 },
      { rank: 2, x: 200, y: 204 },
    ];
    // Unnumbered dots on every first-ring spot but one, straight up from the 2nd: against its lean away from the 1st,
    // which is down.
    const ring = Array.from({ length: 16 }, (_, i) => (i * Math.PI) / 8)
      .filter((angle) => Math.abs(angle - (3 * Math.PI) / 2) > 0.01)
      .map((angle) => ({
        x: 200 + Math.round(22 * Math.cos(angle)),
        y: 204 + Math.round(22 * Math.sin(angle)),
      }));
    const [, second] = layOutNumbers(pair, 390, 460, ring);
    for (const dot of ring)
      expect(Math.hypot(200 + second.dx - dot.x, 204 + second.dy - dot.y)).toBeGreaterThanOrEqual(
        NUMBER_DISC / 2
      );

    // With every spot within reach taken by a dot, the number still moves off the 1st's.
    const everywhere = Array.from({ length: 60 }, (_, i) => ({
      x: 150 + (i % 10) * 10,
      y: 150 + Math.floor(i / 10) * 20,
    }));
    const [, crowded] = layOutNumbers(pair, 390, 460, everywhere);
    expect(Math.max(Math.abs(crowded.dx), Math.abs(crowded.dy + 4))).toBeGreaterThanOrEqual(NUMBER_DISC);
  });

  it("keeps a moved number on the map when its dot is at the edge", () => {
    const drawn = drawnAt(
      [
        { rank: 1, x: 10, y: 10 },
        { rank: 2, x: 14, y: 12 },
      ],
      390,
      460
    );
    const second = drawn[1];
    expect(second.dx || second.dy).toBeTruthy();
    expect(second.x).toBeGreaterThanOrEqual(NUMBER_DISC / 2);
    expect(second.y).toBeGreaterThanOrEqual(NUMBER_DISC / 2);
  });
});
