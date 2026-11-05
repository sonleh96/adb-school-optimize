/**
 * Equal bands across a length, the scale every explore chart lays its columns on: `count` bands, each `step` wide,
 * band `i` centred at `(i + 0.5) * step`. A column of dots, its label and its row in the table all read the same band,
 * so a mark can only be where its band is. Pure arithmetic, so a test can pin every position.
 */
export interface Bands {
  readonly count: number;
  /** The width of each band. */
  readonly step: number;
  /** The centre of band `index`. */
  readonly centre: (index: number) => number;
  /** The boundary before band `index`: 0 is the start of the length and `count` is its end. */
  readonly edge: (index: number) => number;
}

export function bands(count: number, length: number): Bands {
  const step = count > 0 ? length / count : 0;
  return {
    count,
    step,
    centre: (index) => (index + 0.5) * step,
    edge: (index) => index * step,
  };
}
