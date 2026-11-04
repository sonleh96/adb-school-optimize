/**
 * Where the map draws each place number when dots crowd. A number sits on its own dot unless that would put it over
 * an earlier place's number. Then it moves to the nearest clear spot beside its dot, and a short leader joins the two.
 * Earlier places are laid out first, so the first place never moves, and every number of the first ten stays on the
 * map: none is dropped to make room. A moved number goes where it hides no other school's dot when such a spot is
 * near enough, and covers one only when the crowd leaves no other choice.
 */

/** A number's disc, in pixels: the size of the darkest dot, which carries the number when nothing crowds it. */
export const NUMBER_DISC = 16;
/** How far apart two numbers' centres must be, across or down, so that their boxes keep a 2 px gap. */
const CLEAR = NUMBER_DISC + 2;
/**
 * The least distance between a moved number's centre and another numbered dot. A moved number may overlap the edge
 * of a neighbour's dot, but never its centre, where it would read as that school's place.
 */
const OFF_OTHER_DOTS = 12;
/** A moved number hides a dot whose centre is closer than this: its disc's radius and a 2 px margin. */
const HIDES = NUMBER_DISC / 2 + 2;
/** How far from its dot a moved number may go: the first ring just clears the dot, the last is three discs out. */
const RINGS = [22, 30, 38, 46] as const;
const DIRECTIONS = 16;

export interface NumberPoint {
  rank: number;
  /** The dot's centre, in pixels from the map's top left corner. */
  x: number;
  y: number;
}

/** How far a number is drawn from its dot's centre, in pixels. 0, 0 is on the dot. */
export interface NumberSpot {
  rank: number;
  dx: number;
  dy: number;
}

const distance = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
/** The larger of the gaps across and down: two numbers' boxes overlap when it is under CLEAR. */
const apart = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/**
 * Lay out the numbers of `points` in a map `width` by `height` pixels, among the map's other `dots` (the schools that
 * carry no number). The result is in the order of the ranks.
 */
export function layOutNumbers(
  points: readonly NumberPoint[],
  width: number,
  height: number,
  dots: readonly { x: number; y: number }[] = []
): NumberSpot[] {
  const ordered = [...points].sort((a, b) => a.rank - b.rank);
  const drawn: { x: number; y: number }[] = [];
  const spots: NumberSpot[] = [];
  const inside = (x: number, y: number) =>
    x >= NUMBER_DISC / 2 &&
    x <= width - NUMBER_DISC / 2 &&
    y >= NUMBER_DISC / 2 &&
    y <= height - NUMBER_DISC / 2;
  const clearOfNumbers = (x: number, y: number) => drawn.every((d) => apart({ x, y }, d) >= CLEAR);

  for (const point of ordered) {
    if (clearOfNumbers(point.x, point.y) || !inside(point.x, point.y)) {
      place(point, 0, 0);
      continue;
    }
    // Lean away from the numbers it collides with, so the moved numbers fan out around a crowd.
    // Straight up when the crowd is centred on the dot itself.
    const near = drawn.filter((d) => apart(point, d) < CLEAR);
    const ax = point.x - near.reduce((sum, d) => sum + d.x, 0) / near.length;
    const ay = point.y - near.reduce((sum, d) => sum + d.y, 0) / near.length;
    const lean = Math.hypot(ax, ay) < 0.5 ? -Math.PI / 2 : Math.atan2(ay, ax);
    const angles = Array.from({ length: DIRECTIONS }, (_, i) => (i * 2 * Math.PI) / DIRECTIONS).sort(
      (a, b) => turn(a, lean) - turn(b, lean)
    );
    const others = ordered.filter((other) => other !== point);
    // Only the dots a moved number could reach can be hidden by it.
    const reach = RINGS[RINGS.length - 1] + HIDES;
    const nearby = dots.filter((d) => apart(point, d) <= reach);
    let clear: { dx: number; dy: number } | null = null;
    let roomiest: { dx: number; dy: number; room: number } | null = null;
    search: for (const ring of RINGS)
      for (const angle of angles) {
        const dx = Math.round(ring * Math.cos(angle));
        const dy = Math.round(ring * Math.sin(angle));
        const x = point.x + dx;
        const y = point.y + dy;
        if (!inside(x, y)) continue;
        if (others.some((other) => distance(x, y, other.x, other.y) < OFF_OTHER_DOTS)) continue;
        const room = Math.min(Infinity, ...drawn.map((d) => apart({ x, y }, d)));
        if (room >= CLEAR) {
          if (nearby.every((d) => distance(x, y, d.x, d.y) >= HIDES)) {
            clear = { dx, dy };
            break search;
          }
          // Clear of the numbers but over a dot: the first such spot, if no spot hides nothing.
          clear ??= { dx, dy };
        }
        // Nothing clear yet: remember the spot with the most room, for a crowd too dense to clear.
        if (!roomiest || room > roomiest.room) roomiest = { dx, dy, room };
      }
    const chosen = clear ?? roomiest ?? { dx: 0, dy: 0 };
    place(point, chosen.dx, chosen.dy);
  }
  return spots;

  function place(point: NumberPoint, dx: number, dy: number) {
    drawn.push({ x: point.x + dx, y: point.y + dy });
    spots.push({ rank: point.rank, dx, dy });
  }
}

/** The angle between two directions, 0 to pi. */
function turn(a: number, b: number): number {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}
