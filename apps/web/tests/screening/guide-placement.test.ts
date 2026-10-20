/**
 * Failure modes of a help card's place:
 *  1. The card covers the panel that holds the thing it explains (the list, the school card).
 *  2. Beside the key or the map bar, the card sits over the bar instead of above or below it.
 *  3. The card leaves the window.
 *  4. The card grows from the wrong side, away from what it explains.
 */
import { describe, expect, it } from "vitest";

import { placeCard } from "@/lib/screening/guide/placement";

const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });
const VIEW = { width: 1600, height: 1000 };
const CARD = { width: 360, height: 300 };

describe("a help card's place", () => {
  it("opens to the right of the list for a term in the list, growing from its left edge", () => {
    expect(placeCard(box(40, 400, 200, 420), box(16, 16, 432, 984), CARD, VIEW, false)).toEqual({
      x: 444,
      y: 390,
      origin: "0 20px",
    });
  });

  it("opens to the left of the school card for a term in the card", () => {
    expect(placeCard(box(1250, 500, 1400, 520), box(1192, 64, 1584, 960), CARD, VIEW, false)).toEqual({
      x: 820,
      y: 490,
      origin: "100% 20px",
    });
  });

  it("opens above the key, which sits low on the map", () => {
    const placed = placeCard(box(500, 900, 600, 920), box(480, 860, 1100, 960), CARD, VIEW, true);
    expect(placed).toEqual({ x: 480, y: 548, origin: "70px 100%" });
  });

  it("stays inside the window near its bottom edge", () => {
    const placed = placeCard(box(40, 960, 200, 980), box(16, 16, 432, 984), CARD, VIEW, false);
    expect(placed.y).toBe(684);
  });
});
