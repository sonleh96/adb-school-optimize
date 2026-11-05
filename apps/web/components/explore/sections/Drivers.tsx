"use client";

import { type CSSProperties, type ReactNode, useId, useMemo, useState } from "react";

import {
  type Bar,
  type Gap,
  type Piece,
  drawnOf,
  driversOf,
  edgeOf,
  isNeedPart,
  largestOf,
  largestParts,
  needLeads,
  scaleOf,
} from "@/lib/explore/drivers";
import { type BoundCopy, isCopyRuleId } from "@/lib/screening/copy";
import { EXPLORE } from "@/lib/screening/copy/explore";
import { DRIVERS } from "@/lib/screening/copy/explore-drivers";
import { cleanName } from "@/lib/screening/copy/format";
import { LAYOUT } from "@/lib/screening/copy/words";
import { useScreeningResults } from "@/lib/screening/hooks";
import { placeLabel } from "@/lib/screening/list";
import { INPUT_TERM, NEED_PART_TERM } from "@/lib/screening/score-tree";
import type { ResultsResponse, RuleId, RulesResponse } from "@/lib/screening/types";

import page from "../explore.module.css";
import styles from "./drivers.module.css";

/** The page's main rule, and the rule beside it in the tool's own switch: the same factors with urgency put back. */
const MAIN = "additive_no_u";
const WITH_URGENCY = "additive_u" as RuleId;

/** A score or what a part adds, as the tool writes scores: three decimals. */
const f3 = (value: number) => value.toFixed(3);

/** The gap between two neighbours, as the ladder and its sentence write it. */
const gapText = (gap: Gap) =>
  gap.kind === "tie" ? DRIVERS.gaps.tie : gap.kind === "close" ? DRIVERS.gaps.close : f3(gap.size);

/**
 * What puts a school in the top 20: a sentence that answers, then a bar per school of what each part adds to its score
 * and a ladder of the gaps between neighbouring ranks. The list is the page's, or, from the switch, the one that puts
 * the urgency rating back, read when first asked for. A rule whose score is not its parts added up gets one sentence
 * saying why, instead of bars. The marked school is marked in both charts, and drawn on its own when it is outside the
 * top 20. Each chart's drawing is hidden from assistive technology: its rows say each school's rank, name and score,
 * the ladder says each gap in words, and the table gives what each part adds.
 */
export function Drivers({
  rules,
  results,
  copy,
  names,
  marked,
}: {
  rules: RulesResponse;
  results: ResultsResponse;
  copy: BoundCopy;
  /** The name the page shows each school of its list by. */
  names: ReadonlyMap<string, string>;
  /** The marked school's id, or null. */
  marked: string | null;
}) {
  const canSwitch = results.run.rule_id === MAIN && rules.rules.some((r) => r.rule_id === WITH_URGENCY);
  const [withUrgency, setWithUrgency] = useState(false);
  const other = useScreeningResults(canSwitch && withUrgency ? { rule: WITH_URGENCY } : null);
  // Until the other list arrives, the page's own stays on screen, dimmed, so nothing jumps while it loads.
  const waiting = canSwitch && withUrgency && other.data?.run.rule_id !== WITH_URGENCY;
  const list = canSwitch && withUrgency && !waiting ? other.data! : results;
  const rule = rules.rules.find((r) => r.rule_id === list.run.rule_id);
  const view = useMemo(() => (rule ? driversOf(rule, list.rows, marked) : null), [list, rule, marked]);
  const switchName = useId();

  const ruleName = isCopyRuleId(list.run.rule_id) ? copy.ruleName(list.run.rule_id) : "";
  const label = (piece: Piece) =>
    copy.TERMS[isNeedPart(piece) ? NEED_PART_TERM[piece] : INPUT_TERM[piece]].label;
  // A school of the page's list goes by the name the page gives it; under the other rule a school can only be one
  // of those, but its own record's name stands in, never its key.
  const sourceNames = useMemo(
    () => new Map(list.rows.map((r) => [r.school.school_key as string, r.school.source_school_name])),
    [list]
  );
  const nameOf = (id: string) => names.get(id) ?? cleanName(sourceNames.get(id) ?? "");

  // The answer to the question, or the one sentence that says why a rule gets no bars; then the charts.
  let answer: ReactNode = null;
  let charts: ReactNode = null;
  if (!view || view.kind === "unreadable")
    answer = <p className={page.sectionLede}>{DRIVERS.notDrawn.unreadable}</p>;
  else if (view.kind === "need-first")
    answer = <p className={page.sectionLede}>{DRIVERS.notDrawn.needFirst(ruleName)}</p>;
  else if (view.kind === "largest")
    answer = (
      <p className={page.sectionLede}>
        {DRIVERS.notDrawn.largest(
          ruleName,
          view.of.map((input) => copy.TERMS[INPUT_TERM[input]].label)
        )}
      </p>
    );
  else {
    answer = (
      <p className={page.sectionLede} data-region="drivers-answer">
        {DRIVERS.answer(needLeads(view.bars), view.bars.length)}
      </p>
    );
    if (view.bars.length > 0)
      charts = (
        <>
          <BarsFigure
            pieces={view.pieces}
            bars={view.bars}
            outside={view.outside}
            ruleName={ruleName}
            label={label}
            nameOf={nameOf}
            marked={marked}
          />
          {view.gaps.length > 0 ? (
            <GapsFigure
              gaps={view.gaps}
              ranges={view.bars.some((b) => b.place.kind === "range")}
              marked={marked}
            />
          ) : null}
        </>
      );
  }

  return (
    <section className={page.section} aria-labelledby="explore-drivers" data-region="drivers">
      <h2 id="explore-drivers" className={page.question}>
        {DRIVERS.question}
      </h2>
      <div
        className={styles.body}
        data-rule={list.run.rule_id}
        data-waiting={waiting || undefined}
        aria-busy={waiting}
      >
        {answer}
      </div>
      {canSwitch ? (
        <fieldset className={styles.switch}>
          <legend className={styles.switchLegend}>{DRIVERS.rules.legend}</legend>
          <span className={styles.options}>
            {(
              [
                [false, DRIVERS.rules.main],
                [true, DRIVERS.rules.urgency],
              ] as const
            ).map(([value, words]) => (
              <label key={words} className={styles.option}>
                <input
                  type="radio"
                  name={switchName}
                  checked={withUrgency === value}
                  onChange={() => setWithUrgency(value)}
                />
                {words}
              </label>
            ))}
          </span>
        </fieldset>
      ) : null}
      {waiting && other.error ? (
        <div className={page.state} role="alert">
          <p>{LAYOUT.loadFailed}</p>
          <button type="button" className={page.retry} onClick={() => void other.refetch()}>
            {LAYOUT.retry}
          </button>
        </div>
      ) : waiting ? (
        <p className={page.state} role="status">
          {EXPLORE.loading}
        </p>
      ) : null}
      <div
        className={styles.body}
        data-rule={list.run.rule_id}
        data-waiting={waiting || undefined}
        aria-busy={waiting}
      >
        {charts}
      </div>
    </section>
  );
}

/** One school's row: its rank, its name, its bar on the shared scale, and its score or range of scores. */
function BarRow({ bar, max, name, marked }: { bar: Bar; max: number; name: string; marked: boolean }) {
  return (
    <li
      className={styles.row}
      data-school-key={bar.id}
      data-marked={marked || undefined}
      data-lower={bar.lower}
      data-upper={bar.upper}
    >
      <span className={styles.rank}>{placeLabel(bar.place)}</span>
      <span className={styles.name}>
        {marked ? <span className={page.key} data-chosen="" aria-hidden="true" /> : null}
        <span>{name}</span>
      </span>
      <span className={styles.track} aria-hidden="true">
        {drawnOf(bar).map((part) => (
          <span
            key={`${part.piece}-${part.recorded}`}
            className={styles.seg}
            data-piece={part.piece}
            data-open={part.recorded ? undefined : ""}
            data-adds={part.to - part.from}
            style={{ width: `${((part.to - part.from) / max) * 100}%` }}
          />
        ))}
      </span>
      <span className={styles.score}>{scoreText(bar)}</span>
    </li>
  );
}

/** A score, or a range of scores as the tool writes one. */
const scoreText = (bar: Bar) =>
  bar.lower === bar.upper ? f3(bar.lower) : LAYOUT.valueRange(f3(bar.lower), f3(bar.upper));

function BarsFigure({
  pieces,
  bars,
  outside,
  ruleName,
  label,
  nameOf,
  marked,
}: {
  pieces: readonly Piece[];
  bars: readonly Bar[];
  outside: Bar | null;
  ruleName: string;
  label: (piece: Piece) => string;
  nameOf: (id: string) => string;
  marked: string | null;
}) {
  const titleId = useId();
  const captionId = useId();
  const tableId = useId();
  const [open, setOpen] = useState(false);
  const all = outside ? [...bars, outside] : bars;
  const scale = scaleOf(all);
  const largest = largestParts(bars, pieces);
  const others = pieces.filter((piece) => !isNeedPart(piece));
  const anyOpen = all.some((bar) => bar.upper > bar.lower);
  const markedBar = marked === null ? undefined : all.find((bar) => bar.id === marked);
  // The part that adds the most to the marked school's score, or every part level at the most.
  const markedTop = markedBar ? largestOf(markedBar) : [];
  const markedMost = Math.max(0, ...markedTop.map((s) => s.lower));
  const tenths = { "--tenths": scale.ticks.length - 1 } as CSSProperties;

  return (
    <figure className={`${page.part} ${styles.figure}`} aria-labelledby={titleId} data-figure="bars">
      <h3 id={titleId} className={page.partTitle}>
        {DRIVERS.bars.title}
      </h3>
      <p className={page.most}>{DRIVERS.bars.lede(ruleName)}</p>
      {largest ? (
        <p className={page.most} data-region="largest">
          {DRIVERS.bars.largest(largest.pieces.map(label), largest.count, bars.length)}
        </p>
      ) : null}
      <div className={styles.legend} data-region="drivers-legend">
        <p className={styles.legendHead}>{DRIVERS.bars.need}</p>
        <ul className={styles.keys}>
          {pieces.filter(isNeedPart).map((piece) => (
            <li key={piece} data-piece-key={piece}>
              <span className={styles.swatch} data-piece={piece} aria-hidden="true" />
              {label(piece)}
            </li>
          ))}
        </ul>
        <ul className={styles.keys}>
          {others.length > 0 ? (
            <li data-piece-key={others.join(" ")}>
              <span className={styles.swatch} aria-hidden="true" />
              {DRIVERS.bars.others(others.map(label))}
            </li>
          ) : null}
          {anyOpen ? (
            <li data-piece-key="open">
              <span className={styles.swatch} data-open="" aria-hidden="true" />
              {DRIVERS.bars.unrecorded}
            </li>
          ) : null}
        </ul>
      </div>
      <ol className={styles.rows} style={tenths} data-max={scale.max} data-region="bars">
        {bars.map((bar) => (
          <BarRow key={bar.id} bar={bar} max={scale.max} name={nameOf(bar.id)} marked={bar.id === marked} />
        ))}
      </ol>
      <div className={styles.axisRow} aria-hidden="true">
        <div className={styles.ticks}>
          {scale.ticks.map((tick, i) => (
            <span key={tick} style={{ "--at": i / (scale.ticks.length - 1) } as CSSProperties}>
              {String(tick)}
            </span>
          ))}
        </div>
        <span className={styles.axisName}>{DRIVERS.bars.axis}</span>
      </div>
      {bars.some((bar) => bar.place.kind === "range") ? (
        <p className={page.note}>{DRIVERS.bars.ranges}</p>
      ) : null}
      {outside ? (
        <div className={styles.outside}>
          <p className={styles.outsideHead}>{DRIVERS.bars.outside}</p>
          <ol className={styles.rows} style={tenths} data-max={scale.max} data-region="outside">
            <BarRow bar={outside} max={scale.max} name={nameOf(outside.id)} marked />
          </ol>
        </div>
      ) : null}
      {markedBar && markedMost > 0 ? (
        <p className={page.chosenLine} data-region="marked-lines">
          <span className={page.key} data-chosen="" aria-hidden="true" />
          <span>
            <b>{nameOf(markedBar.id)}</b>{" "}
            {DRIVERS.bars.marked(
              markedTop.map((s) => label(s.piece)),
              f3(markedMost)
            )}
          </span>
        </p>
      ) : null}
      <button
        type="button"
        className={page.toggle}
        aria-expanded={open}
        aria-controls={open ? tableId : undefined}
        onClick={() => setOpen((was) => !was)}
      >
        {open ? EXPLORE.table.hide : EXPLORE.table.show}
      </button>
      {open ? (
        <div id={tableId} className={styles.scroll} role="region" aria-labelledby={captionId} tabIndex={0}>
          <table className={`${page.table} ${styles.wide}`}>
            <caption id={captionId} className={page.srOnly}>
              {DRIVERS.bars.table.caption(ruleName)}
            </caption>
            <thead>
              <tr>
                <th scope="col">{DRIVERS.bars.table.rank}</th>
                <th scope="col">{DRIVERS.bars.table.school}</th>
                {pieces.map((piece) => (
                  <th key={piece} scope="col" data-piece-key={piece}>
                    {label(piece)}
                  </th>
                ))}
                <th scope="col">{DRIVERS.bars.table.score}</th>
              </tr>
            </thead>
            <tbody>
              {all.map((bar) => (
                <tr key={bar.id} data-school-key={bar.id} data-marked={bar.id === marked || undefined}>
                  <td>{placeLabel(bar.place)}</td>
                  <th scope="row">{nameOf(bar.id)}</th>
                  {bar.segments.map((s) => (
                    <td key={s.piece}>
                      {s.lower === s.upper
                        ? f3(s.lower)
                        : LAYOUT.valueRange(s.lower === 0 ? "0" : f3(s.lower), f3(s.upper))}
                    </td>
                  ))}
                  <td>{scoreText(bar)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </figure>
  );
}

function GapsFigure({
  gaps,
  ranges,
  marked,
}: {
  gaps: readonly Gap[];
  ranges: boolean;
  marked: string | null;
}) {
  const titleId = useId();
  const largest = Math.max(0, ...gaps.map((gap) => gap.size));
  const edge = edgeOf(gaps);
  const ties = gaps.filter((gap) => gap.kind === "tie");
  const close = gaps.filter((gap) => gap.kind === "close");
  return (
    <figure className={`${page.part} ${styles.figure}`} aria-labelledby={titleId} data-figure="gaps">
      <h3 id={titleId} className={page.partTitle}>
        {DRIVERS.gaps.title}
      </h3>
      <p className={page.most}>{DRIVERS.gaps.lede}</p>
      <p className={page.most} data-region="gap-line">
        {DRIVERS.gaps.line(ties.length, close.length)}
        {edge ? ` ${DRIVERS.gaps.edge(edge.kind === "tie" ? null : gapText(edge))}` : null}
      </p>
      <ol className={styles.ladder} data-region="gaps">
        {gaps.map((gap) => (
          <li
            key={gap.above.rank}
            className={styles.step}
            data-kind={gap.kind}
            data-edge={gap === edge || undefined}
            data-marked={gap.above.id === marked || gap.below.id === marked || undefined}
            data-size={gap.size}
          >
            <span className={styles.pair}>
              {DRIVERS.gaps.pair(gap.above.rank, gap.below.rank)}
              {gap === edge ? <span className={styles.edgeTag}>{DRIVERS.gaps.edgeTag}</span> : null}
            </span>
            <span className={styles.gapTrack} aria-hidden="true">
              {gap.kind === "tie" ? (
                <span className={styles.equal}>=</span>
              ) : (
                <span className={styles.gapBar} style={{ width: `${(gap.size / largest) * 100}%` }} />
              )}
            </span>
            <span className={styles.gapValue}>{gapText(gap)}</span>
          </li>
        ))}
      </ol>
      <div className={styles.notes}>
        {ties.length > 0 ? <p className={page.note}>{DRIVERS.gaps.tieNote}</p> : null}
        {ties.some((gap) => gap.size > 0) ? <p className={page.note}>{DRIVERS.gaps.roundingNote}</p> : null}
        {close.length > 0 ? <p className={page.note}>{DRIVERS.gaps.closeNote}</p> : null}
        {ranges ? <p className={page.note}>{DRIVERS.gaps.rangesNote}</p> : null}
      </div>
    </figure>
  );
}
