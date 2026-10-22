"use client";

import { ChevronUp } from "lucide-react";
import { useId, useState } from "react";

import type { BoundCopy, CopyRuleId } from "@/lib/screening/copy";
import { RAMP_HEX } from "@/lib/screening/marks";
import type { Band } from "@/lib/screening/workspace/bands";

import styles from "./screening.module.css";

/** The three marks, drawn as the map draws them. */
function Mark({ kind }: { kind: "dot" | "range" | "ring" }) {
  return <span className={styles.keyMark} data-mark={kind} aria-hidden />;
}

/** The number on each of the map's first ten dots, as the map draws it: a "1" on the darkest blue. */
function NumberMark() {
  return (
    <span className={styles.keyNumber} style={{ background: RAMP_HEX[0] }} aria-hidden>
      1
    </span>
  );
}

/**
 * The map's key. It starts as one line: the colour strip from the first place to the last, and the three marks with a
 * few words each. "What the map shows" opens the full key above it: which rule the places belong to, the place bands
 * from the data, and what each mark means. The words are the copy's.
 */
export function Legend({
  copy,
  rule,
  bands,
  ranged,
  stacked,
  stale,
}: {
  copy: BoundCopy;
  rule: CopyRuleId | null;
  bands: readonly Band[];
  /** How many schools in the list show a range: the strip leaves them out, and the full key says so. */
  ranged: number;
  stacked: boolean;
  stale: boolean;
}) {
  const [open, setOpen] = useState(false);
  const body = useId();
  const { LAYOUT, TERMS } = copy;
  const title = rule ? LAYOUT.underRule(TERMS.rank.label, copy.rulePlainName(rule)) : TERMS.rank.label;
  const label = (band: Band) =>
    band.lo === band.hi
      ? copy.ordinal(band.lo)
      : LAYOUT.placeRange(copy.ordinal(band.lo), copy.ordinal(band.hi));
  const first = bands[0];
  const last = bands[bands.length - 1];

  return (
    <section
      className={`${styles.panel} ${styles.legend}`}
      data-slot="legend"
      data-region="legend"
      data-open={open || undefined}
      data-stacked={stacked || undefined}
      aria-label={LAYOUT.legendAria}
      aria-busy={stale}
      data-stale={stale || undefined}
    >
      {open ? (
        <div id={body} className={styles.legendBody}>
          <p className={styles.legendTitle} data-testid="legend-rule" data-term="rank">
            {title}
          </p>
          {bands.length > 0 ? (
            <ol
              className={styles.ramp}
              style={{ gridTemplateColumns: `repeat(${bands.length}, minmax(0, 88px))` }}
            >
              {bands.map((band, index) => (
                <li key={band.lo}>
                  <i style={{ background: RAMP_HEX[index] }} />
                  <span>{label(band)}</span>
                </li>
              ))}
            </ol>
          ) : null}
          {last ? (
            <p className={styles.rampNote} data-region="legend-ramp-note">
              {LAYOUT.keyRampNote(last.hi, ranged)}
            </p>
          ) : null}
          <ul className={styles.keys}>
            <li data-region="legend-number">
              <NumberMark />
              <b>{LAYOUT.keyNumbers}</b>
            </li>
            <li data-region="legend-point">
              <Mark kind="dot" />
              <b data-term="mark_dot">{TERMS.mark_dot.label}</b>
              <span>{TERMS.mark_dot.line}</span>
            </li>
            <li data-region="legend-range">
              <Mark kind="range" />
              <b data-term="mark_range">{TERMS.mark_range.label}</b>
              <span>{TERMS.mark_range.line}</span>
            </li>
            <li data-region="legend-queue">
              <Mark kind="ring" />
              <b data-term="mark_ring">{TERMS.mark_ring.label}</b>
              <span>{TERMS.mark_ring.line}</span>
            </li>
          </ul>
        </div>
      ) : null}
      <div className={styles.keyLine}>
        {first && last && !open ? (
          <span
            className={styles.miniRamp}
            data-term="rank"
            role="img"
            aria-label={LAYOUT.keyRamp(copy.ordinal(first.lo), copy.ordinal(last.hi), last.hi)}
          >
            <span>{copy.ordinal(first.lo)}</span>
            <span className={styles.miniSwatches} aria-hidden>
              {bands.map((band, index) => (
                <i key={band.lo} style={{ background: RAMP_HEX[index] }} />
              ))}
            </span>
            <span>{copy.ordinal(last.hi)}</span>
          </span>
        ) : null}
        {open ? null : (
          <ul className={styles.keysShort}>
            <li data-region="legend-number">
              <NumberMark />
              <span>{LAYOUT.keyNumbers}</span>
            </li>
            <li data-region="legend-point">
              <Mark kind="dot" />
              <span data-term="mark_dot">{LAYOUT.keyDot}</span>
            </li>
            <li data-region="legend-range">
              <Mark kind="range" />
              <span data-term="mark_range">{LAYOUT.keyRange}</span>
            </li>
            <li data-region="legend-queue">
              <Mark kind="ring" />
              <span data-term="mark_ring">{LAYOUT.keyRing}</span>
            </li>
          </ul>
        )}
        <button
          type="button"
          className={styles.keyToggle}
          data-region="key-toggle"
          aria-expanded={open}
          aria-controls={body}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? LAYOUT.keyLess : LAYOUT.keyMore}
          <ChevronUp size={12} aria-hidden data-open={open || undefined} />
        </button>
      </div>
    </section>
  );
}
