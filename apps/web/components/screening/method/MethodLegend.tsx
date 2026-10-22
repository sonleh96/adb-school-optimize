"use client";

import { ChevronUp } from "lucide-react";
import { useId } from "react";

import type { BoundCopy, CopyRuleId } from "@/lib/screening/copy";
import type { Method } from "@/lib/screening/copy/method";
import { RAMP_HEX } from "@/lib/screening/marks";
import { MOVE_HEX, OUTSIDE_HEX } from "@/lib/screening/method/moves";
import type { Band } from "@/lib/screening/workspace/bands";

import { RuleSymbol } from "../RuleArea";
import base from "../screening.module.css";
import styles from "./method.module.css";

const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

interface Common {
  copy: BoundCopy;
  method: Method;
  collapsed: boolean;
  stale: boolean;
  /** How many schools show a range of positions, and how many have incomplete records. */
  ranges: number;
  incomplete: number;
  /** The folded key is open. The workspace holds it, so the key keeps it when the narrow Map view moves it. */
  open: boolean;
  onToggle: () => void;
}

function Frame({
  copy,
  collapsed,
  stale,
  open,
  onToggle,
  title,
  children,
}: Pick<Common, "copy" | "collapsed" | "stale" | "open" | "onToggle"> & {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  const body = useId();
  const { LAYOUT } = copy;
  return (
    <section
      className={`${base.panel} ${base.legend} ${styles.legend}`}
      data-slot="legend"
      data-region="legend"
      data-collapsed={collapsed || undefined}
      aria-label={LAYOUT.legendAria}
      aria-busy={stale}
      data-stale={stale || undefined}
    >
      <div className={base.legendTop}>
        <div className={styles.legendTitle} data-testid="legend-rule" data-term="rank">
          {title}
        </div>
        {collapsed ? (
          <button
            type="button"
            className={base.keyToggle}
            // A disclosure, as the plain key's toggle is: one name, its state in aria-expanded and in the chevron.
            aria-expanded={open}
            aria-controls={open ? body : undefined}
            onClick={onToggle}
          >
            {LAYOUT.keyLabel}
            <ChevronUp size={12} aria-hidden data-open={open || undefined} />
          </button>
        ) : null}
      </div>
      {!collapsed || open ? (
        <div id={body} className={styles.legendRow}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

function Keys({ copy, ranges, incomplete }: Pick<Common, "copy" | "ranges" | "incomplete">) {
  const { TERMS, LAYOUT } = copy;
  const bare = (label: string) => label.replace(/\s*\(\d+\)$/, "");
  return (
    <>
      <span className={styles.legendKey} data-region="legend-range">
        <span className={base.keyMark} data-mark="range" aria-hidden />
        <span>
          <span data-term="rank_range">
            {bare(TERMS.rank_range.label)} <em>{copy.formatCount(ranges)}</em>
          </span>
          <span className={styles.legendHint}>{LAYOUT.legendNoAirQuality}</span>
        </span>
      </span>
      <span className={styles.legendKey} data-region="legend-queue">
        <span className={base.keyMark} data-mark="ring" aria-hidden />
        <span>
          <span data-term="queue">
            {bare(TERMS.queue.label)} <em>{copy.formatCount(incomplete)}</em>
          </span>
          <span className={styles.legendHint}>{LAYOUT.legendIncomplete}</span>
        </span>
      </span>
    </>
  );
}

/** The key in method details: the rule's letter, the place bands as numbers, and the two other marks with counts. */
export function MethodLegend({
  rule,
  bands,
  numbered,
  ...common
}: Common & { rule: CopyRuleId; bands: readonly Band[]; numbered: number }) {
  const { copy, method } = common;
  return (
    <Frame
      {...common}
      title={
        <>
          <RuleSymbol symbol={copy.ruleSymbol(rule)} className={styles.legendSym} />
          <b>{method.legend.title(lcFirst(copy.ruleLabel(rule)))}</b>
          <span>{method.legend.sub(numbered)}</span>
        </>
      }
    >
      <ol className={base.ramp} style={{ gridTemplateColumns: `repeat(${bands.length}, minmax(0, 72px))` }}>
        {bands.map((band, index) => (
          <li key={band.lo}>
            <i style={{ background: RAMP_HEX[index] }} />
            <span>
              {band.lo === band.hi ? band.lo : copy.LAYOUT.placeRange(String(band.lo), String(band.hi))}
            </span>
          </li>
        ))}
      </ol>
      <span className={styles.legendSep} aria-hidden />
      <Keys {...common} />
    </Frame>
  );
}

/** The key in compare mode: places moved from one rule to the other, on a scale from up to down. */
export function CompareLegend({
  a,
  b,
  k,
  n,
  numbered,
  ...common
}: Common & { a: CopyRuleId; b: CopyRuleId; k: number; n: number; numbered?: number }) {
  const { copy, method } = common;
  const bins = method.compare.moveBins();
  return (
    <Frame
      {...common}
      title={
        <>
          <b>{method.compare.legendTitle(copy.ruleShortName(a), copy.ruleShortName(b))}</b>
          <span>{method.compare.legendSub(n, numbered)}</span>
        </>
      }
    >
      <div className={styles.moveRamp}>
        <span className={styles.rampEnd}>{method.compare.legendUp}</span>
        <ol>
          {MOVE_HEX.map((hex, index) => (
            <li key={index}>
              <i style={{ background: hex }} />
              <span>{bins[index]}</span>
            </li>
          ))}
        </ol>
        <span className={styles.rampEnd}>{method.compare.legendDown}</span>
      </div>
      <span className={styles.legendSep} aria-hidden />
      <span className={styles.legendKey}>
        <span className={styles.sizeKey} aria-hidden>
          <i />
          <i />
        </span>
        <span>{method.compare.legendSize(k, copy.ruleShortName(a), copy.ruleShortName(b))}</span>
      </span>
      <span className={styles.legendKey}>
        <i className={styles.outsideKey} style={{ background: OUTSIDE_HEX }} aria-hidden />
        <span>{method.compare.legendOutside}</span>
      </span>
      <Keys {...common} />
    </Frame>
  );
}
