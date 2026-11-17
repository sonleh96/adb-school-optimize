/**
 * Failure modes of a guide step's ring:
 *  1. A group of elements gets one ring per element, or a ring that misses one of them.
 *  2. A ring points at rows scrolled out of their panel, or reaches past the panel's visible part.
 *  3. A ring straddles the edge of the floating panel that holds its elements.
 *  4. A ring is drawn round nothing (an element not laid out, or hidden by scrolling).
 */
import { describe, expect, it } from "vitest";

import { ringAround } from "@/lib/screening/guide/rings";

const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });

describe("a step's ring", () => {
  it("rings the union of a group, with room around it", () => {
    const ring = ringAround(
      [
        { box: box(100, 200, 300, 240), clip: null },
        { box: box(116, 250, 340, 290), clip: null },
      ],
      null
    );
    expect(ring).toEqual({ x: 92, y: 194, width: 256, height: 102 });
  });

  it("rings only the part of a list its scrolling panel shows", () => {
    const panel = box(0, 300, 400, 500);
    const ring = ringAround(
      [
        { box: box(20, 260, 380, 340), clip: panel },
        { box: box(20, 340, 380, 420), clip: panel },
      ],
      null
    );
    expect(ring).toEqual({ x: 12, y: 294, width: 376, height: 132 });
  });

  it("keeps the ring inside the floating panel that holds the elements", () => {
    const ring = ringAround([{ box: box(18, 100, 430, 140), clip: null }], box(16, 16, 432, 900));
    expect(ring).toEqual({ x: 20, y: 94, width: 408, height: 52 });
  });

  it("draws nothing for elements scrolled out of sight or not laid out", () => {
    const panel = box(0, 300, 400, 500);
    expect(ringAround([{ box: box(20, 504, 380, 560), clip: panel }], null)).toBeNull();
    expect(ringAround([{ box: box(20, 495, 380, 560), clip: panel }], null)).toBeNull();
    expect(ringAround([{ box: box(0, 0, 0, 0), clip: null }], null)).toBeNull();
  });
});
