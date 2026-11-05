import { bands } from "@/lib/explore/scale";
import type { PartStrip } from "@/lib/explore/strip";
import { RAMP_HEX } from "@/lib/screening/marks";

import styles from "./strip.module.css";

/** As wide as the part's bar above it, and one line of the comparison text tall. */
const WIDTH = 48;
const HEIGHT = 17;
/** The baseline's top, where the columns stand; the 1 px line under it ends the strip. */
const FLOOR = HEIGHT - 1;
/** The tallest column. The school's dot sits on top of its own column, so above the tallest is room for half a dot. */
const TALLEST = 10;
const DOT = 4;
/** The dot's ring, in the panel's white, keeps it apart from its column. */
const RING = 1;
/**
 * The gap between two columns, and the widest a column is drawn, so a part with two or three columns still has thin
 * bars.
 */
const GAP = 2;
const WIDEST = 6;
/** The explore charts' marks: the map ramp's darkest step for the school, its lightest for every other school. */
const SCHOOL = RAMP_HEX[0];
const OTHERS = RAMP_HEX[RAMP_HEX.length - 1];

/** A column standing on the baseline: square at its foot, its top corners rounded as far as its size allows. */
function columnPath(x: number, width: number, height: number): string {
  const r = Math.min(1, width / 2, height);
  const top = FLOOR - height;
  return `M${x},${FLOOR}V${top + r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${FLOOR}Z`;
}

/**
 * One part's strip: the explore page's chart of the part in a single row, each column a short bar whose height follows
 * the number of schools in it, and the school's dot in navy on top of its own column, as the chart marks it. The line
 * beside it says the same in words, so the drawing is hidden from assistive technology and the line is read once.
 */
export function PartStripFigure({ strip }: { strip: PartStrip }) {
  const scale = bands(strip.counts.length, WIDTH);
  const columnWidth = Math.min(scale.step - GAP, WIDEST);
  const most = Math.max(...strip.counts);
  // A column of one school still shows; an empty column draws nothing above the baseline.
  const heightOf = (count: number) => (count === 0 ? 0 : Math.max(1, (TALLEST * count) / most));
  // The dot is centred on its column's top; over a short column it rests on the baseline instead.
  const dotY = Math.min(FLOOR - heightOf(strip.counts[strip.at]), FLOOR - DOT - RING);
  return (
    <svg
      className={styles.strip}
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      aria-hidden="true"
      focusable="false"
      data-region="need-strip"
    >
      <line className={styles.baseline} x1={0} x2={WIDTH} y1={FLOOR + 0.5} y2={FLOOR + 0.5} />
      {strip.counts.map((count, column) =>
        count === 0 ? null : (
          <path
            key={column}
            className={styles.column}
            fill={OTHERS}
            d={columnPath(scale.centre(column) - columnWidth / 2, columnWidth, heightOf(count))}
            data-column={column}
            data-count={count}
          />
        )
      )}
      <circle
        className={styles.school}
        fill={SCHOOL}
        cx={scale.centre(strip.at)}
        cy={dotY}
        r={DOT}
        data-column={strip.at}
      />
    </svg>
  );
}
