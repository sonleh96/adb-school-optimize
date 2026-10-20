/**
 * The place bands of the map and the key, taken from the data (robustness R12).
 *
 * The bands end at the 10th and 20th places, then at about a third and two thirds of the schools with a single place,
 * then at the last place. A cut is kept only if it lies past the previous one, so a short list collapses to fewer
 * bands instead of repeating or reordering them: 90 schools give 10, 20, 30, 60, 90; 16 give 10, 16; 1 gives 1.
 * A place past the last cut belongs to the last band.
 */
export interface Band {
  /** First and last place of the band, both inclusive. */
  readonly lo: number;
  readonly hi: number;
}

export function placeBands(placed: number): Band[] {
  if (placed < 1) return [];
  const cuts = [10, 20, Math.round(placed / 3), Math.round((2 * placed) / 3), placed];
  const kept: number[] = [];
  for (const cut of cuts) {
    const at = Math.min(cut, placed);
    if (at > (kept.at(-1) ?? 0)) kept.push(at);
    if (at === placed) break;
  }
  return kept.map((hi, index) => ({ lo: index === 0 ? 1 : kept[index - 1] + 1, hi }));
}

/** The band a place falls in, as an index into `bands`. */
export function bandOf(place: number, bands: readonly Band[]): number {
  const index = bands.findIndex((band) => place <= band.hi);
  return index < 0 ? bands.length - 1 : index;
}
