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

/**
 * The map's key in words: which rule the places belong to, the place bands from the data, and what each mark means.
 * Narrow windows show its title and a Key disclosure; it opens over the map. The words are the copy's.
 */
export function Legend({
  copy,
  rule,
  bands,
  collapsed,
  stacked,
  stale,
}: {
  copy: BoundCopy;
  rule: CopyRuleId | null;
  bands: readonly Band[];
  collapsed: boolean;
  stacked: boolean;
  stale: boolean;
}) {
  const [open, setOpen] = useState(false);
  const body = useId();
  const { LAYOUT, TERMS } = copy;
  const title = rule ? LAYOUT.underRule(TERMS.rank.label, copy.ruleName(rule)) : TERMS.rank.label;
  const showBody = !collapsed || open;
  const label = (band: Band) =>
    band.lo === band.hi
      ? copy.ordinal(band.lo)
      : LAYOUT.placeRange(copy.ordinal(band.lo), copy.ordinal(band.hi));

  return (
    <section
      className={`${styles.panel} ${styles.legend}`}
      data-slot="legend"
      data-region="legend"
      data-collapsed={collapsed || undefined}
      data-stacked={stacked || undefined}
      aria-label={LAYOUT.legendAria}
      aria-busy={stale}
      data-stale={stale || undefined}
    >
      <div className={styles.legendTop}>
        <p className={styles.legendTitle} data-testid="legend-rule" data-term="rank">
          {title}
        </p>
        {collapsed ? (
          <button
            type="button"
            className={styles.keyToggle}
            aria-expanded={open}
            aria-controls={body}
            aria-label={open ? LAYOUT.keyHide : LAYOUT.keyShow}
            onClick={() => setOpen((value) => !value)}
          >
            {LAYOUT.keyLabel}
            <ChevronUp size={12} aria-hidden data-open={open || undefined} />
          </button>
        ) : null}
      </div>
      {showBody ? (
        <div id={body} className={styles.legendBody}>
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
          <ul className={styles.keys}>
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
    </section>
  );
}
