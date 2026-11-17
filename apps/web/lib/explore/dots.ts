/**
 * Where each dot of a dot histogram sits: one dot per item, the items of a group stacked in that group's band from the
 * baseline up. Every band holds the same number of dots side by side, so a column twice as tall holds about twice as
 * many items, and a dot is never drawn outside its own band, so it cannot read as a neighbour's. Items keep the order
 * they come in: the first is at the bottom left of its band.
 *
 * Pure, so the explore charts and their tests read the same positions. E1's dot plot of top-20 frequencies stacks its
 * schools the same way.
 */
import { bands } from "./scale";

export interface DotStyle {
  /** The dot's diameter and the gap between two dots, in pixels. */
  readonly diameter: number;
  readonly gap: number;
  /**
   * The most dots a row holds, however wide the band: with few bands, rows as wide as their band would read as a
   * spread along the axis, which a band does not have.
   */
  readonly maxColumns?: number;
  /**
   * The least room, in pixels, kept between two neighbouring bands' dots, so two columns never read as one. A band
   * keeps at most 40% of its width for it.
   */
  readonly gutter?: number;
}

export interface StackedDot<T> {
  readonly item: T;
  /** The band the dot sits in: the index of its group. */
  readonly band: number;
  /** The dot's centre, across from the plot's start and up from its baseline, in pixels. */
  readonly x: number;
  readonly y: number;
}

export interface DotStack<T> {
  readonly dots: readonly StackedDot<T>[];
  /** The diameter and gap drawn: the style's, or both scaled down when a band has no room for one dot. */
  readonly diameter: number;
  readonly gap: number;
  /** How many dots a full row of any band holds. */
  readonly columns: number;
  /** From the baseline to the top of the tallest band's top dot, or 0 when there is no dot. */
  readonly height: number;
}

/** A row that a float division leaves a hair short of whole still counts as whole. */
const ROUNDING = 1e-9;

export function stackDots<T>(
  groups: readonly (readonly T[])[],
  length: number,
  style: DotStyle
): DotStack<T> {
  const scale = bands(groups.length, length);
  // The width a band's dots may take: the band, less the room kept between it and its neighbours.
  const usable = scale.step - Math.min(style.gutter ?? 0, scale.step * 0.4);
  // A band too narrow for one dot gets one smaller dot per row, so neighbouring bands never overlap.
  const shrink = usable < style.diameter ? usable / style.diameter : 1;
  const diameter = style.diameter * shrink;
  const gap = style.gap * shrink;
  const pitch = diameter + gap;
  const fit = pitch > 0 ? Math.max(1, Math.floor((usable + gap) / pitch + ROUNDING)) : 1;
  const columns = Math.min(fit, style.maxColumns ?? Infinity);

  const dots: StackedDot<T>[] = [];
  let rows = 0;
  groups.forEach((items, band) => {
    rows = Math.max(rows, Math.ceil(items.length / columns));
    items.forEach((item, i) => {
      const row = Math.floor(i / columns);
      const inRow = Math.min(columns, items.length - row * columns);
      // Each row sits centred on its band, the last one too when it is not full.
      const start = scale.centre(band) - (inRow * pitch - gap) / 2;
      dots.push({
        item,
        band,
        x: start + diameter / 2 + (i - row * columns) * pitch,
        y: diameter / 2 + row * pitch,
      });
    });
  });
  return { dots, diameter, gap, columns, height: rows > 0 ? rows * pitch - gap : 0 };
}
