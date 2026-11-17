"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";

import { type Bump, type BumpSchool, GROUP_OF, type Standing, TOP, isKept, joins } from "@/lib/explore/bump";
import type { BoundCopy, CopySchool } from "@/lib/screening/copy";
import { EXPLORE } from "@/lib/screening/copy/explore";
import { EXPLORE_STABILITY } from "@/lib/screening/copy/explore-stability";
import { bandTicks, slopeFrame } from "@/lib/screening/method/slope";

import explore from "../explore.module.css";
import styles from "./stability.module.css";

const W = EXPLORE_STABILITY.bump;
/** Room left of the first column for the rank labels, and below the ranks for the row of schools not in a list. */
const GUTTER = 28;
const LANE = 32;
/**
 * The room a group's name needs over a column of its own, the benchmark's, in pixels: a pair of columns always has
 * twice a column's room, and the longest pair name may wrap.
 */
const LONE_NAME = 62;
/** From these column widths, a column's header says which rule of its pair it is: in one word, then in two. */
const SHORT_VARIANT = 44;
const LONG_VARIANT = 86;
/** The least height of a range's bar: a full row, so a range of one rank is a bar, not a point or a ring. */
const MIN_BAR = 12;
/** The ranks labelled down the top 20. */
const TOP_TICKS = [1, 5, 10, 15, 20];

/** The groups of neighbouring columns that share a name, each with the columns it spans. */
function groupsOf(rules: Bump["rules"]) {
  const groups: { head: (typeof rules)[number]; span: number }[] = [];
  for (const rule of rules) {
    const head = GROUP_OF[rule];
    const last = groups.at(-1);
    if (last && last.head === head) last.span += 1;
    else groups.push({ head, span: 1 });
  }
  return groups;
}

/**
 * Each column's share of the width: one each, except a column whose group is itself, which takes as much more as its
 * name needs to fit over it, up to twice a column. The columns name rules, not a scale, so their widths mean nothing.
 */
function columnsOf(rules: Bump["rules"], room: number) {
  const groups = groupsOf(rules);
  const paired = groups.filter((g) => g.span > 1).reduce((sum, g) => sum + g.span, 0);
  const lone = rules.length - paired;
  const share =
    lone === 0 || room <= LONE_NAME
      ? 1
      : Math.min(2, Math.max(1, (paired * LONE_NAME) / (room - lone * LONE_NAME)));
  const weights = groups.flatMap((g) => Array.from({ length: g.span }, () => (g.span > 1 ? 1 : share)));
  const unit = room / weights.reduce((sum, w) => sum + w, 0);
  const starts = weights.map((_, i) => weights.slice(0, i).reduce((sum, w) => sum + w, 0) * unit);
  return { groups, weights, unit, starts };
}

/**
 * Where the main rule's top 20 sit under each of the seven rules: one column per rule, the main rule first, ranks
 * from 1 at the top, the top 20 in full rows and the rest drawn closer below. A school's rank is a dot, joined to its
 * rank in the next column; a range of possible ranks is a filled bar, joined to nothing, and a school not in a rule's
 * list is an open ring in the row below the ranks. The marked school is navy and drawn last; when the main rule ranks
 * it below its top 20, or gives it a range, it is added. The drawing is hidden from assistive technology; the table
 * says it all.
 */
export function StabilityBump({
  bump,
  ruleName,
  copy,
  names,
  marked,
}: {
  bump: Bump;
  /** The anchor rule's name, as the page's words name it. */
  ruleName: string;
  copy: BoundCopy;
  names: ReadonlyMap<string, string>;
  marked: CopySchool | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const tableId = useId();

  const { rules, schools, n } = bump;
  const frame = slopeFrame(TOP, n);
  const columns = columnsOf(rules, Math.max(0, width - GUTTER));
  const x = (column: number) =>
    GUTTER + columns.starts[column] + (columns.weights[column] * columns.unit) / 2;
  const variants = columns.unit >= LONG_VARIANT ? "long" : columns.unit >= SHORT_VARIANT ? "short" : null;
  const laneTop = frame.height + 4;
  const height = frame.height + (bump.anyOut ? LANE : 0);
  const ringY = laneTop + 21;
  const top = schools.filter((s) => s.top);
  const markedRow = marked ? (schools.find((s) => s.id === marked.id) ?? null) : null;
  const ranges = schools.some((s) => s.standings.some((standing) => standing.kind === "range"));

  // Three strengths of line: the marked school's, then the schools kept in the top 20 under every rule, then the rest.
  const marks = (school: BumpSchool, on: boolean) => {
    const key = school.id;
    const kept = isKept(school);
    return (
      <g key={key} data-school-key={key} data-marked={on || undefined} data-kept={kept || undefined}>
        {joins(school.standings).map(([from, to]) => (
          <line
            key={from.column}
            className={on ? styles.lineMarked : kept ? styles.lineKept : styles.bumpLine}
            x1={x(from.column)}
            y1={frame.y(from.rank)}
            x2={x(to.column)}
            y2={frame.y(to.rank)}
            data-from={rules[from.column]}
            data-to={rules[to.column]}
          />
        ))}
        {school.standings.map((standing, column) => {
          const rule = rules[column];
          switch (standing.kind) {
            case "rank":
              return (
                <circle
                  key={rule}
                  className={on ? styles.pointMarked : kept ? styles.pointKept : styles.point}
                  cx={x(column)}
                  cy={frame.y(standing.rank)}
                  r={on ? 4 : 2.75}
                  data-rule={rule}
                  data-rank={standing.rank}
                />
              );
            case "range": {
              // A filled bar with square ends; a range whose ends meet is still a row tall, so it never reads as a
              // point or as the open ring of a school outside a list.
              const half = on ? 3.5 : 3;
              const reach = standing.best === standing.worst ? MIN_BAR / 2 : half;
              const y1 = frame.y(standing.best) - reach;
              const y2 = frame.y(standing.worst) + reach;
              return (
                <rect
                  key={rule}
                  className={on ? styles.rangeMarked : kept ? styles.rangeKept : styles.range}
                  x={x(column) - half}
                  y={y1}
                  width={half * 2}
                  height={y2 - y1}
                  rx={1}
                  data-rule={rule}
                  data-best={standing.best}
                  data-worst={standing.worst}
                />
              );
            }
            case "out":
              return (
                <circle
                  key={rule}
                  className={on ? styles.ringMarked : styles.ring}
                  cx={x(column)}
                  cy={ringY}
                  r={on ? 4.5 : 3.5}
                  data-rule={rule}
                  data-out=""
                />
              );
            case "none":
              return null;
          }
        })}
      </g>
    );
  };

  const cell = (standing: Standing) => {
    switch (standing.kind) {
      case "rank":
        return copy.formatCount(standing.rank);
      case "range":
        return standing.best === standing.worst
          ? W.table.either(copy.formatCount(standing.best))
          : copy.LAYOUT.placeRange(copy.formatCount(standing.best), copy.formatCount(standing.worst));
      case "out":
        return W.lane;
      case "none":
        return W.table.none;
    }
  };

  return (
    <figure className={explore.part} aria-labelledby={titleId} data-chart="bump">
      <h3 id={titleId} className={explore.partTitle}>
        {W.title(ruleName)}
      </h3>
      <p className={explore.most} data-region="bump-answer">
        {W.answer(bump.kept, top.length, rules.length)}
      </p>
      <p className={styles.testNote}>{W.what(ruleName)}</p>
      <p className={styles.bumpKey} data-region="bump-key" aria-hidden="true">
        <span>
          <span className={styles.keyLine} data-kept="" />
          {W.key.kept}
        </span>
        <span>
          <span className={styles.keyLine} />
          {W.key.rest}
        </span>
      </p>
      <div ref={host} className={styles.bump} aria-hidden="true">
        <div
          className={styles.head}
          style={{
            gridTemplateColumns: `${GUTTER}px ${columns.weights.map((w) => `minmax(0, ${w}fr)`).join(" ")}`,
          }}
        >
          <span />
          {columns.groups.map((group) => (
            <span
              key={group.head}
              className={styles.group}
              style={{ gridColumn: `span ${group.span}` }}
              data-group={group.head}
            >
              {copy.ruleShortName(group.head)}
            </span>
          ))}
          {variants ? (
            <>
              <span />
              {rules.map((rule) => (
                <span
                  key={rule}
                  className={styles.variant}
                  data-rule={rule}
                  data-anchor={rule === rules[0] || undefined}
                >
                  {copy.ruleUsesUrgency(rule)
                    ? variants === "long"
                      ? copy.LAYOUT.withUrgency
                      : W.with
                    : variants === "long"
                      ? copy.LAYOUT.withoutUrgency
                      : W.without}
                </span>
              ))}
            </>
          ) : null}
        </div>
        {width > 0 ? (
          <svg
            className={styles.svg}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            focusable="false"
            data-n={n}
          >
            <rect
              className={styles.zone}
              x={GUTTER}
              y={frame.top - 3}
              width={width - GUTTER}
              height={Math.min(TOP, n) * 13 + 6}
            />
            <rect
              className={styles.anchor}
              x={GUTTER}
              y={0}
              width={columns.weights[0] * columns.unit}
              height={frame.height}
            />
            {rules.map((rule, column) => (
              <line
                key={rule}
                className={styles.guide}
                x1={x(column)}
                x2={x(column)}
                y1={frame.top}
                y2={frame.height - 4}
              />
            ))}
            {n > TOP ? (
              <line
                className={styles.breakLine}
                data-part="break"
                x1={GUTTER}
                x2={width}
                y1={frame.breakY}
                y2={frame.breakY}
              />
            ) : null}
            {[...TOP_TICKS.filter((rank) => rank <= Math.min(TOP, n)), ...bandTicks(TOP, n)].map((rank) => (
              <text
                key={rank}
                className={styles.tick}
                x={GUTTER - 7}
                y={frame.y(rank) + 3.5}
                textAnchor="end"
              >
                {copy.formatCount(rank)}
              </text>
            ))}
            {schools.filter((s) => s !== markedRow).map((school) => marks(school, false))}
            {markedRow ? marks(markedRow, true) : null}
            {bump.anyOut ? (
              <>
                <line className={styles.breakLine} x1={GUTTER} x2={width} y1={laneTop} y2={laneTop} />
                <text className={styles.laneText} x={GUTTER} y={laneTop + 11}>
                  {W.lane}
                </text>
              </>
            ) : null}
          </svg>
        ) : null}
      </div>
      <p className={explore.axis}>{W.axis}</p>
      {n > TOP ? <p className={explore.note}>{W.closer(TOP + 1, n)}</p> : null}
      {variants !== "long" ? <p className={explore.note}>{W.pairs}</p> : null}
      {ranges ? <p className={explore.note}>{W.range}</p> : null}
      {bump.anyOut ? <p className={explore.note}>{W.out}</p> : null}
      {bump.reaching > 0 ? <p className={explore.note}>{W.reaching(bump.reaching)}</p> : null}
      {marked && markedRow && !markedRow.top ? (
        <p className={explore.chosenLine} data-region="bump-marked">
          <span className={explore.key} data-chosen="" aria-hidden="true" />
          <span>
            <b>{names.get(marked.id)}</b>{" "}
            {markedRow.standings[0].kind === "rank"
              ? W.below(ruleName, copy.ordinal(markedRow.standings[0].rank))
              : W.ranged(ruleName)}
          </span>
        </p>
      ) : null}
      <button
        type="button"
        className={explore.toggle}
        aria-expanded={open}
        aria-controls={open ? tableId : undefined}
        onClick={() => setOpen((was) => !was)}
      >
        {open ? EXPLORE.table.hide : EXPLORE.table.show}
      </button>
      {open ? (
        <div
          id={tableId}
          className={styles.scroll}
          role="region"
          aria-labelledby={`${tableId}-caption`}
          tabIndex={0}
        >
          <table className={`${explore.table} ${styles.table}`}>
            <caption id={`${tableId}-caption`} className={explore.srOnly}>
              {W.title(ruleName)}
            </caption>
            <colgroup />
            {columns.groups.map((group) => (
              <colgroup key={group.head} span={group.span} />
            ))}
            <thead>
              <tr>
                <th scope="col" rowSpan={2}>
                  {W.table.school}
                </th>
                {columns.groups.map((group) => (
                  <th key={group.head} scope="colgroup" colSpan={group.span} data-group={group.head}>
                    {copy.ruleShortName(group.head)}
                  </th>
                ))}
              </tr>
              <tr>
                {rules.map((rule) => (
                  <th key={rule} scope="col" data-rule={rule}>
                    {/* One word to the eye, as over the chart; the whole name to a screen reader. */}
                    <span aria-hidden="true">{copy.ruleUsesUrgency(rule) ? W.with : W.without}</span>
                    <span className={explore.srOnly}>
                      {copy.ruleUsesUrgency(rule) ? copy.LAYOUT.withUrgency : copy.LAYOUT.withoutUrgency}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schools.map((school) => (
                <tr
                  key={school.id}
                  data-school-key={school.id}
                  data-marked={school === markedRow || undefined}
                >
                  <th scope="row">
                    {names.get(school.id)}
                    {school === markedRow ? <span className={explore.marked}>{W.table.marked}</span> : null}
                  </th>
                  {school.standings.map((standing, column) => (
                    <td key={rules[column]} data-rule={rules[column]} data-kind={standing.kind}>
                      {cell(standing)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </figure>
  );
}
