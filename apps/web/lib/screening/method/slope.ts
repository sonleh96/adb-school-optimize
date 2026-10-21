/**
 * The compare chart's geometry: the top k places in full rows, the rest of the common cohort compressed below,
 * and labels that fit their column (robustness R4). Text is measured by the caller, so this stays pure.
 */

/** Measures `text` at `size` px and `weight` in the chart's typeface. */
export type Measure = (text: string, size: number, weight: number) => number;

/** Pairs of a name ending and its short form, from the copy (METHOD.compare.suffixes). */
export type Suffixes = readonly (readonly [RegExp, string])[];

export const MIN_LABEL_SIZE = 9.5;
const ELLIPSIS = "…";

export interface FittedLabel {
  readonly text: string;
  readonly size: number;
  /** The text is not the whole name, so the full name goes in the label's title. */
  readonly shortened: boolean;
}

const abbreviate = (name: string, suffixes: Suffixes): string => {
  for (const [ending, short] of suffixes) if (ending.test(name)) return name.replace(ending, short);
  return name;
};

/** The name cut in the middle, keeping its start and its end, to the longest that fits `avail`. */
function middleEllipsis(name: string, fits: (text: string) => boolean): string {
  const chars = [...name];
  let lo = 0;
  let hi = chars.length - 1;
  let best = ELLIPSIS;
  // How many characters to keep; the start keeps the larger half.
  while (lo <= hi) {
    const keep = Math.floor((lo + hi) / 2);
    const head = Math.ceil(keep / 2);
    const text = `${chars.slice(0, head).join("").trimEnd()}${ELLIPSIS}${chars
      .slice(chars.length - (keep - head))
      .join("")
      .trimStart()}`;
    if (fits(text)) {
      best = text;
      lo = keep + 1;
    } else hi = keep - 1;
  }
  return best;
}

/**
 * A school's label in `avail` px beside its place (`rankPart`, never shortened): the whole name at `base` size if
 * it fits; else the name with a known ending shortened, from `base` down to 9.5 px; else that, cut in the middle.
 */
export function fitLabel(
  name: string,
  rankPart: string,
  avail: number,
  base: number,
  weight: number,
  measure: Measure,
  suffixes: Suffixes
): FittedLabel {
  const width = (text: string, size: number) => measure(text + rankPart, size, weight);
  if (width(name, base) <= avail) return { text: name, size: base, shortened: false };
  const short = abbreviate(name, suffixes);
  for (let size = base; size >= MIN_LABEL_SIZE; size -= 0.5)
    if (width(short, size) <= avail) return { text: short, size, shortened: short !== name };
  return {
    text: middleEllipsis(short, (text) => width(text, MIN_LABEL_SIZE) <= avail),
    size: MIN_LABEL_SIZE,
    shortened: true,
  };
}

/** The width a name column needs for a label: whole if that fits in `cap`, otherwise shortened. */
export function labelWidth(
  name: string,
  rankPart: string,
  cap: number,
  base: number,
  weight: number,
  measure: Measure,
  suffixes: Suffixes
): number {
  const whole = measure(name + rankPart, base, weight);
  return whole <= cap ? whole : Math.min(cap, measure(abbreviate(name, suffixes) + rankPart, base, weight));
}

/**
 * Labels below the full rows, each wanting to sit at its school's `y`: pushed apart to `gap`, then pulled up as a
 * block if the last one would fall past `hi`. Labels that would rise above `lo` are dropped (their line still shows).
 */
export function placeLabels<T extends { y: number }>(
  items: readonly T[],
  lo: number,
  hi: number,
  gap: number
): (T & { ly: number })[] {
  const placed = [...items].sort((p, q) => p.y - q.y).map((item) => ({ ...item, ly: item.y }));
  let previous = -Infinity;
  for (const item of placed) {
    item.ly = Math.max(item.y, previous + gap);
    previous = item.ly;
  }
  const over = placed.length ? placed[placed.length - 1].ly - hi : 0;
  if (over > 0) {
    let next = Infinity;
    for (let i = placed.length - 1; i >= 0; i -= 1) {
      placed[i].ly = Math.min(placed[i].ly - over, next - gap);
      next = placed[i].ly;
    }
  }
  return placed.filter((item) => item.ly >= lo - 2);
}

export interface SlopeFrame {
  readonly height: number;
  readonly top: number;
  /** Where the full rows end and the compressed band starts. */
  readonly zoneTop: number;
  readonly breakY: number;
  readonly fontSize: number;
  /** The vertical position of a place. */
  readonly y: (place: number) => number;
}

/** Full rows for places 1 to k, the rest of the `n` places in a band below; with no rest, no band. */
export function slopeFrame(k: number, n: number): SlopeFrame {
  const shown = Math.min(k, n);
  const rowH = k === 20 ? 13 : 21;
  const top = 6;
  const topH = shown * rowH;
  const rest = Math.max(0, n - k);
  const gap = rest > 0 ? 22 : 0;
  const restH = rest === 0 ? 0 : Math.min(k === 20 ? 118 : 160, Math.max(40, rest * 6));
  const zoneTop = top + topH + gap;
  const rowC = rest > 0 ? restH / rest : 0;
  return {
    height: zoneTop + restH + 6,
    top,
    zoneTop,
    breakY: top + topH + gap / 2,
    fontSize: k === 20 ? 10.75 : 12,
    y: (place) => (place <= k ? top + (place - 0.5) * rowH : zoneTop + (place - k - 0.5) * rowC),
  };
}

/** Tick places in the compressed band: the first place below the full rows, then every twenty, not crowding it. */
export function bandTicks(k: number, n: number): number[] {
  if (n <= k) return [];
  const ticks = [k + 1];
  for (let t = 20; t <= n; t += 20) if (t > k + 7) ticks.push(t);
  if (n > k + 7 && !ticks.includes(n) && n - ticks[ticks.length - 1] >= 8) ticks.push(n);
  return ticks;
}
