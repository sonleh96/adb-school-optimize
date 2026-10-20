"use client";

import { ArrowLeftRight, ChevronDown, ChevronLeft } from "lucide-react";
import { useRef } from "react";

import type { BoundCopy, CopyRuleId } from "@/lib/screening/copy";
import type { Method } from "@/lib/screening/copy/method";
import { type Compared, MOVE_EDGES } from "@/lib/screening/method/compare";
import type { SchoolKey } from "@/lib/screening/types";
import type { Patch, WorkspaceState } from "@/lib/screening/workspace/state";

import { Popover } from "../method/Popover";
import { RuleSymbol } from "../RuleArea";
import type { RuleChoice } from "../useScreeningData";
import base from "../screening.module.css";
import method from "../method/method.module.css";
import styles from "./compare.module.css";
import { SlopeChart } from "./SlopeChart";

type Slot = "a" | "b";

/** One end of the comparison: the rule's letter, label and role, opening a list of every rule. */
function Picker({
  copy,
  words,
  slot,
  rule,
  rules,
  open,
  layer,
  instant,
  onOpen,
  onClose,
  onPick,
}: {
  copy: BoundCopy;
  words: Method;
  slot: Slot;
  rule: CopyRuleId;
  rules: readonly RuleChoice[];
  open: boolean;
  layer: HTMLElement | null;
  instant: boolean;
  onOpen: () => void;
  onClose: () => void;
  onPick: (rule: CopyRuleId) => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const { LAYOUT } = copy;
  const name = slot === "a" ? LAYOUT.from : LAYOUT.to;
  const item = (r: RuleChoice) => (
    <li key={r.id}>
      <button
        type="button"
        className={base.popRule}
        aria-pressed={r.id === rule}
        onClick={() => onPick(r.id)}
      >
        <RuleSymbol symbol={copy.ruleSymbol(r.id)} />
        <span className={base.popRuleText}>
          <span className={base.popRuleLabel}>{copy.ruleLabel(r.id)}</span>
          <span className={base.popRuleRole}>{copy.ruleRoleLine(r.id)}</span>
        </span>
      </button>
    </li>
  );
  return (
    <>
      <button
        ref={button}
        type="button"
        className={styles.picker}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={`screening-pick-${slot}`}
        aria-label={`${words.compare.pickAria(name.toLowerCase())}: ${copy.ruleLabel(rule)}`}
        onClick={open ? onClose : onOpen}
      >
        <span className={base.eyebrow}>{name}</span>
        <span className={styles.pickerMain}>
          <RuleSymbol symbol={copy.ruleSymbol(rule)} className={styles.pickerSym} />
          <span className={styles.pickerWords}>
            <span className={styles.pickerLabel}>{copy.ruleLabel(rule)}</span>
            <span className={styles.pickerRole}>{copy.ruleRoleLine(rule)}</span>
          </span>
          <ChevronDown size={13} aria-hidden className={styles.pickerChevron} />
        </span>
      </button>
      {open ? (
        <Popover
          id={`screening-pick-${slot}`}
          anchor={button}
          layer={layer}
          label={words.compare.pickAria(name.toLowerCase())}
          width={320}
          instant={instant}
          onClose={onClose}
        >
          <p className={base.eyebrow}>{words.compare.pickPrimary}</p>
          <ul className={base.popList}>{rules.filter((r) => r.primary).map(item)}</ul>
          <p className={base.eyebrow}>{LAYOUT.otherRules}</p>
          <ul className={base.popList}>{rules.filter((r) => !r.primary).map(item)}</ul>
        </Popover>
      ) : null}
    </>
  );
}

/** A small strip of a range school's possible places among every school that can be put in order. */
function RangeGlyph({ best, worst, k, count }: { best: number; worst: number; k: number; count: number }) {
  const w = 120;
  const x = (v: number) => 2 + ((v - 1) / Math.max(1, count - 1)) * (w - 4);
  const kx = x(Math.min(count, k + 0.5));
  return (
    <svg viewBox={`0 0 ${w} 14`} width={w} height="14" aria-hidden className={styles.glyph}>
      <line x1="2" x2={w - 2} y1="7" y2="7" stroke="rgba(21,24,29,.16)" />
      <rect x="2" y="2" width={Math.max(0, kx - 2)} height="10" fill="#0a2e73" fillOpacity="0.06" />
      <line x1={kx} x2={kx} y1="1" y2="13" stroke="rgba(21,24,29,.35)" />
      {best === worst ? (
        <rect x={x(best) - 1.25} y="2" width="2.5" height="10" rx="1" fill="#4a4f57" />
      ) : (
        <rect
          x={x(best) - 1}
          y="2.5"
          width={Math.max(2, x(worst) - x(best) + 2)}
          height="9"
          className={styles.glyphRange}
        />
      )}
    </svg>
  );
}

export interface CompareColumnProps {
  copy: BoundCopy;
  words: Method;
  a: CopyRuleId;
  b: CopyRuleId;
  rules: readonly RuleChoice[];
  /** The comparison, turned to the screen's order; null while it loads or when it failed. */
  data: Compared | null;
  failed: boolean;
  onRetry: () => void;
  /** Each school's display name. */
  names: ReadonlyMap<string, string>;
  /** Every school that can be put in order: the ranges strip's scale. */
  count: number;
  pop: WorkspaceState["pop"];
  layer: HTMLElement | null;
  keyboard: boolean;
  selected: SchoolKey | null;
  hovered: SchoolKey | null;
  onState: (patch: Patch) => void;
  onSelect: (key: SchoolKey) => void;
  onHover: (key: SchoolKey | null) => void;
}

/**
 * Compare mode's column: the two rules, how far their lists agree (in the same words as What changed, at the top 10
 * or 20), which schools join or leave the top, the chart of places under both, and the range schools under both.
 */
export function CompareColumn(props: CompareColumnProps) {
  const { copy, words, a, b, rules, data, names, pop, layer, keyboard, onState } = props;
  const { STRINGS } = copy;
  const pick = (slot: Slot) => (rule: CopyRuleId) => {
    const other = slot === "a" ? b : a;
    // Choosing the rule already on the other side swaps the two.
    onState(
      rule === other
        ? { a: b, b: a, pop: null }
        : slot === "a"
          ? { a: rule, pop: null }
          : { b: rule, pop: null }
    );
  };
  const picker = (slot: Slot) => (
    <Picker
      copy={copy}
      words={words}
      slot={slot}
      rule={slot === "a" ? a : b}
      rules={rules}
      open={pop === (slot === "a" ? "pickA" : "pickB")}
      layer={layer}
      instant={keyboard}
      onOpen={() => onState({ pop: slot === "a" ? "pickA" : "pickB" })}
      onClose={() => onState({ pop: null })}
      onPick={pick(slot)}
    />
  );

  let lead = "";
  let more = "";
  if (data) {
    const sentence = copy.comparisonSentence(a, b);
    const parts = sentence.split(/(?<=\.) /);
    if (data.k === 20) {
      lead = parts[0];
      more = parts.slice(1).join(" ");
    } else {
      lead =
        data.overlap === Math.min(data.k, data.n)
          ? words.compare.sameTop(copy.ruleName(a), copy.ruleName(b), data.k, data.n)
          : words.compare.shareTop(copy.ruleName(a), copy.ruleName(b), data.overlap ?? 0, data.k, data.n);
      more = parts[parts.length - 1];
    }
  }
  const moves = (title: string, list: Compared["entrants"]) => (
    <div className={styles.ioCol}>
      <p className={base.eyebrow}>
        {title} <em>{copy.formatCount(list.length)}</em>
      </p>
      <ul className={styles.io}>
        {list.map((r) => (
          <li key={r.key}>
            <button type="button" className={styles.ioName} onClick={() => props.onSelect(r.key)}>
              {names.get(r.key) ?? r.name}
            </button>
            <span className={styles.ioMove}>{`${r.a} → ${r.b}`}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className={styles.column}>
      <section className={styles.head} aria-label={words.compare.eyebrow}>
        <div className={method.ruleTop}>
          <span className={base.eyebrow}>{words.compare.eyebrow}</span>
          <button
            type="button"
            className={method.backButton}
            data-region="compare-toggle"
            onClick={() => onState({ mode: "screen" })}
          >
            <ChevronLeft size={13} aria-hidden />
            {words.rule.leaveCompare}
          </button>
        </div>
        <div className={styles.pickers} data-region="rule-identity">
          {picker("a")}
          <button
            type="button"
            className={styles.swap}
            aria-label={words.compare.swap}
            title={words.compare.swap}
            onClick={() => onState({ a: b, b: a })}
          >
            <ArrowLeftRight size={14} aria-hidden />
          </button>
          {picker("b")}
        </div>
      </section>
      <div className={styles.scroll}>
        {data === null ? (
          props.failed ? (
            <div className={base.fullState} role="alert">
              <p>{copy.LAYOUT.loadFailed}</p>
              <button type="button" className={base.retryButton} onClick={props.onRetry}>
                {copy.LAYOUT.retry}
              </button>
            </div>
          ) : (
            <p className={base.state} role="status">
              {copy.LAYOUT.loading}
            </p>
          )
        ) : (
          <>
            <section
              className={styles.sec}
              data-region="compare-statement"
              aria-label={words.compare.statementAria}
            >
              <p className={styles.lead}>{lead}</p>
              {more ? <p className={styles.more}>{more}</p> : null}
              {data.entrants.length + data.exits.length > 0 ? (
                <div className={styles.ioGrid}>
                  {moves(words.compare.enteringK(data.k), data.entrants)}
                  {moves(words.compare.leavingK(data.k), data.exits)}
                </div>
              ) : null}
              <p className={styles.source}>{STRINGS.comparisonSource}</p>
            </section>
            <section className={styles.sec} data-region="slope-chart" aria-label={words.compare.slopeAria}>
              <div className={styles.slopeHead}>
                <span className={styles.cap}>{copy.ruleShortName(a)}</span>
                <span className={`${styles.cap} ${styles.capMid}`}>{words.compare.slopeMid(data.n)}</span>
                <span className={styles.cap}>{copy.ruleShortName(b)}</span>
                <span className={styles.kSeg} role="group" aria-label={words.compare.kAria}>
                  {[10, 20].map((k) => (
                    <button key={k} type="button" aria-pressed={data.k === k} onClick={() => onState({ k })}>
                      {words.compare.topK} {k}
                    </button>
                  ))}
                </span>
              </div>
              <SlopeChart
                data={data}
                names={names}
                suffixes={words.compare.suffixes}
                edges={MOVE_EDGES}
                breakLabel={words.compare.slopeBreak(data.k, data.n)}
                label={words.compare.slopeAria}
                selected={props.selected}
                hovered={props.hovered}
                onSelect={props.onSelect}
                onHover={props.onHover}
              />
            </section>
            {data.ranges.length > 0 ? (
              <section className={styles.sec} data-region="range-strip">
                <div className={styles.secHead}>
                  <span className={base.eyebrow}>{copy.TERMS.rank_range.label}</span>
                  <span className={base.eyebrow}>{words.compare.rangesSub()}</span>
                </div>
                <p className={styles.note}>{words.compare.rangesNote(data.k)}</p>
                <div className={styles.rangeGrid} role="table" aria-label={copy.TERMS.rank_range.label}>
                  <div role="row" className={styles.rangeRow}>
                    <span role="columnheader" />
                    <span role="columnheader" className={styles.rangeHead}>
                      {copy.ruleShortName(a)}
                    </span>
                    <span role="columnheader" className={styles.rangeHead}>
                      {copy.ruleShortName(b)}
                    </span>
                  </div>
                  {data.ranges.map((r) => (
                    <div
                      key={r.key}
                      role="row"
                      className={styles.rangeRow}
                      data-on={r.key === props.selected || undefined}
                      data-hover={r.key === props.hovered || undefined}
                    >
                      <span role="rowheader">
                        <button
                          type="button"
                          className={styles.rangeName}
                          onClick={() => props.onSelect(r.key)}
                          onPointerEnter={() => props.onHover(r.key)}
                          onPointerLeave={() => props.onHover(null)}
                        >
                          {names.get(r.key) ?? r.name}
                        </button>
                      </span>
                      {[r.a, r.b].map((bounds, i) => (
                        <span role="cell" key={i} className={styles.rangeCell}>
                          {bounds ? (
                            <>
                              <RangeGlyph
                                best={bounds.best}
                                worst={bounds.worst}
                                k={data.k}
                                count={props.count}
                              />
                              <span className={styles.rangeNum}>
                                {bounds.best === bounds.worst
                                  ? copy.ordinal(bounds.best)
                                  : copy.LAYOUT.placeRange(
                                      copy.ordinal(bounds.best),
                                      copy.ordinal(bounds.worst)
                                    )}
                                {bounds.best === bounds.worst ? (
                                  <span className={styles.exact}> {words.sameEitherWay}</span>
                                ) : null}
                              </span>
                            </>
                          ) : (
                            <span className={styles.na}>{words.noResultForSchool}</span>
                          )}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            <p className={base.listCaveat}>{STRINGS.caveat}</p>
          </>
        )}
      </div>
    </div>
  );
}
