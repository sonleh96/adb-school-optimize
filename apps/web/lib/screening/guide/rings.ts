/**
 * Where a guide step's ring sits: around the union of the elements it points at, cut to the part a scrolling panel
 * shows, and kept inside the floating panel that holds them, so a ring never straddles a panel's edge or points at
 * rows scrolled out of sight.
 */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface Ring {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One element a ring takes in: its box and, when it sits in a scrolling panel, the part of the panel on screen. */
export interface Piece {
  readonly box: Box;
  readonly clip: Box | null;
}

/** Space between a ring and what it rings. */
export const PAD = { x: 8, y: 6 } as const;
/** How far inside its panel's edge a ring stays. */
const INSET = 4;
/** Less than this much of an element showing in its panel does not count as showing. */
const MIN_VISIBLE = 8;

/** The ring round `pieces`, or null when none of them shows. */
export function ringAround(pieces: readonly Piece[], panel: Box | null): Ring | null {
  let union: Box | null = null;
  for (const { box, clip } of pieces) {
    if (box.right - box.left <= 0 || box.bottom - box.top <= 0) continue;
    const top = clip ? Math.max(box.top, clip.top) : box.top;
    const bottom = clip ? Math.min(box.bottom, clip.bottom) : box.bottom;
    if (bottom - top < MIN_VISIBLE) continue;
    union = union
      ? {
          left: Math.min(union.left, box.left),
          right: Math.max(union.right, box.right),
          top: Math.min(union.top, top),
          bottom: Math.max(union.bottom, bottom),
        }
      : { left: box.left, right: box.right, top, bottom };
  }
  if (!union) return null;
  let left = union.left - PAD.x;
  let right = union.right + PAD.x;
  if (panel) {
    left = Math.max(left, panel.left + INSET);
    right = Math.min(right, panel.right - INSET);
  }
  return {
    x: Math.round(left),
    y: Math.round(union.top - PAD.y),
    width: Math.round(right - left),
    height: Math.round(union.bottom - union.top + 2 * PAD.y),
  };
}

/** Whether two sets of rings would draw the same, so a frame that changes nothing writes nothing. */
export const sameRings = (a: readonly Ring[], b: readonly Ring[]): boolean =>
  a.length === b.length &&
  a.every((r, i) => r.x === b[i].x && r.y === b[i].y && r.width === b[i].width && r.height === b[i].height);
