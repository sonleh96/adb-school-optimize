"use client";

import { type CSSProperties, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import { stackDots } from "@/lib/explore/dots";
import { type PartColumns, columnOf, raised, tallest, ticksOf } from "@/lib/explore/parts";
import { EXPLORE } from "@/lib/screening/copy/explore";
import { formatCount } from "@/lib/screening/copy/format";

import styles from "./explore.module.css";

/** A dot and the gap round it: 6 px on a phone's narrow card, so a tall column stays short enough to read; 8 px wider. */
const styleFor = (width: number) => ({
  diameter: width < 480 ? 6 : 8,
  gap: 2,
  maxColumns: 10,
  // Air between two columns, as the dataviz rules leave between bars, so neighbouring records never merge.
  gutter: 14,
});
/** Room above the dots for the marked school's larger dot, and below the baseline for the lines between quarters. */
const ABOVE = 4;
const BELOW = 6;

/** The school marked across the page, as this chart words it. */
export interface Marked {
  readonly id: string;
  readonly name: string;
  /** What its own record gives for the part, and how that compares with the list. */
  readonly lines: readonly string[];
}

/**
 * One part of school need across the list: the sentence that answers for the whole list, a dot histogram with one dot
 * per school in the column of what its record gives, the marked school's dot larger and in navy, what the axis
 * measures, and the marked school's own lines. The drawing is hidden from assistive technology; its words and its
 * table say everything it shows, and the table opens from a button any keyboard reaches.
 */
export function PartChart({ chart, marked }: { chart: PartColumns; marked: Marked | null }) {
  const words = EXPLORE.parts[chart.key];
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
  const markedId = marked?.id ?? null;
  // The marked school sits on top of its column, under a light wash the column's width, so it is found at a glance.
  const stack = useMemo(
    () => (width > 0 ? stackDots(raised(chart.columns, markedId), width, styleFor(width)) : null),
    [chart, width, markedId]
  );
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const tableId = useId();

  const top = tallest(chart);
  const ticks = ticksOf(chart);
  const markedColumn = marked ? columnOf(chart, marked.id) : null;
  const markedUnrecorded = marked !== null && chart.unrecorded.some((school) => school.id === marked.id);
  const markedDot = marked && stack ? stack.dots.find((dot) => dot.item.id === marked.id) : undefined;
  const base = stack ? ABOVE + Math.max(stack.height, stack.diameter) : 0;
  // The wash behind the marked school's column: as wide as a full row of dots and a little room, never past its band.
  const wash =
    markedDot && stack
      ? (() => {
          const step = width / chart.steps.length;
          const room = Math.min(step - 4, stack.columns * (stack.diameter + stack.gap) - stack.gap + 12);
          return { x: (markedDot.band + 0.5) * step - room / 2, width: room };
        })()
      : null;

  return (
    <figure className={styles.part} aria-labelledby={titleId} data-part={chart.key}>
      <h3 id={titleId} className={styles.partTitle}>
        {words.title}
      </h3>
      {top !== null ? (
        <p className={styles.most} data-region="most">
          {EXPLORE.most(chart.key, chart.steps[top], chart.columns[top].length, chart.total)}
        </p>
      ) : null}
      <div ref={host} className={styles.plot}>
        {stack ? (
          <svg
            className={styles.svg}
            width={width}
            height={base + BELOW}
            viewBox={`0 0 ${width} ${base + BELOW}`}
            aria-hidden="true"
            focusable="false"
          >
            {markedDot && wash ? (
              <rect className={styles.wash} x={wash.x} y={0} width={wash.width} height={base} rx={6} />
            ) : null}
            <line className={styles.baseline} x1={0} x2={width} y1={base + 0.5} y2={base + 0.5} />
            {ticks.map((tick) =>
              tick.kind === "edge" ? (
                <line
                  key={tick.quarter}
                  className={styles.edgeTick}
                  x1={tick.at * width}
                  x2={tick.at * width}
                  y1={base}
                  y2={base + BELOW}
                />
              ) : null
            )}
            {stack.dots.map((dot) =>
              dot === markedDot ? null : (
                <circle
                  key={dot.item.id}
                  className={styles.dot}
                  cx={dot.x}
                  cy={base - dot.y}
                  r={stack.diameter / 2}
                  data-school-key={dot.item.id}
                  data-column={dot.band}
                />
              )
            )}
            {/* The marked school's dot, drawn last so its ring sits over its neighbours. */}
            {markedDot ? (
              <circle
                className={styles.chosen}
                cx={markedDot.x}
                cy={base - markedDot.y}
                r={stack.diameter / 2 + 2.5}
                data-school-key={markedDot.item.id}
                data-column={markedDot.band}
                data-marked=""
              />
            ) : null}
          </svg>
        ) : null}
        <div className={styles.ticks} data-kind={chart.steps[0]?.kind} aria-hidden="true">
          {ticks.map((tick) => (
            <span
              key={tick.kind === "edge" ? `edge-${tick.quarter}` : `step-${tick.step}`}
              data-tick={tick.kind}
              style={
                { "--at": tick.at, ...(tick.kind === "step" ? { "--room": tick.room } : {}) } as CSSProperties
              }
            >
              {tick.kind === "edge" ? words.edge?.(tick.quarter) : words.label(chart.steps[tick.step])}
            </span>
          ))}
        </div>
      </div>
      <p className={styles.axis}>{words.axis}</p>
      {words.spacing ? (
        <p className={styles.axis} data-region="spacing">
          {words.spacing}
        </p>
      ) : null}
      <p className={styles.axis}>{words.direction}</p>
      {chart.unrecorded.length > 0 ? (
        <p className={styles.note}>{EXPLORE.unrecorded(chart.unrecorded.length)}</p>
      ) : null}
      {marked ? (
        <p className={styles.chosenLine} data-region="marked-lines">
          <span className={styles.key} data-chosen="" aria-hidden="true" />
          <span>
            <b>{marked.name}</b> {marked.lines.join(" ")}
          </span>
        </p>
      ) : null}
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={open ? tableId : undefined}
        onClick={() => setOpen((was) => !was)}
      >
        {open ? EXPLORE.table.hide : EXPLORE.table.show}
      </button>
      {open ? (
        <table id={tableId} className={styles.table}>
          <caption className={styles.srOnly}>{words.title}</caption>
          <thead>
            <tr>
              <th scope="col">{EXPLORE.table.step}</th>
              <th scope="col">{EXPLORE.table.schools}</th>
            </tr>
          </thead>
          <tbody>
            {chart.steps.map((step, index) => (
              <tr key={index} data-marked={index === markedColumn || undefined}>
                <th scope="row">
                  {words.label(step)}
                  {index === markedColumn ? (
                    <span className={styles.marked}>{EXPLORE.table.marked}</span>
                  ) : null}
                </th>
                <td>{formatCount(chart.columns[index].length)}</td>
              </tr>
            ))}
            {chart.unrecorded.length > 0 ? (
              <tr data-marked={markedUnrecorded || undefined}>
                <th scope="row">
                  {EXPLORE.table.unrecorded}
                  {markedUnrecorded ? <span className={styles.marked}>{EXPLORE.table.marked}</span> : null}
                </th>
                <td>{formatCount(chart.unrecorded.length)}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      ) : null}
    </figure>
  );
}
