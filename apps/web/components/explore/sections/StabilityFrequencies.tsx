"use client";

import { type CSSProperties, useId, useLayoutEffect, useRef, useState } from "react";

import { stackDots } from "@/lib/explore/dots";
import type { FrequencyPlot } from "@/lib/explore/frequencies";
import { raised } from "@/lib/explore/parts";
import type { BoundCopy, CopySchool } from "@/lib/screening/copy";
import { EXPLORE } from "@/lib/screening/copy/explore";
import { EXPLORE_STABILITY } from "@/lib/screening/copy/explore-stability";
import type { PersistenceRule } from "@/lib/screening/copy/model";

import explore from "../explore.module.css";
import styles from "./stability.module.css";

const W = EXPLORE_STABILITY.frequencies;

/**
 * A dot and the gap round it: small on a phone's narrow card, where a column of a hundred schools at none of the runs
 * must stay short enough to read, and 8 px wider.
 */
const styleFor = (width: number) =>
  width < 480
    ? { diameter: 5, gap: 1.5, maxColumns: 10, gutter: 6 }
    : { diameter: 8, gap: 2, maxColumns: 10, gutter: 12 };
/** Room above the dots for the marked school's larger dot, and below the baseline for the line's foot. */
const ABOVE = 5;
const BELOW = 5;

/**
 * How often each school stayed in the top 20 when the paper changed the weights at random: for each setting of one
 * rule's test, a dot histogram with one dot per school of the list, in the column of its share of runs, under the line
 * and the shaded band the method details draw. Each column names its range under it, and a sentence beside the axis
 * says the columns are ranges drawn the same width. A switch shows the other rule's own test; the marked school is the
 * navy dot on top of its column. The drawing is hidden from assistive technology: its words, the marked school's
 * shares and the table say everything it shows.
 */
export function StabilityFrequencies({
  plots,
  urgency,
  copy,
  names,
  marked,
}: {
  plots: ReadonlyMap<PersistenceRule, FrequencyPlot>;
  /**
   * The earlier method's list while it is on its way, or when it did not arrive: its test is offered in the switch but
   * cannot be pressed, and a line under the switch says why, with Retry when it failed. Null once its test is drawn,
   * and when the page does not offer it.
   */
  urgency: { readonly failed: boolean; readonly retry: () => void } | null;
  copy: BoundCopy;
  names: ReadonlyMap<string, string>;
  marked: CopySchool | null;
}) {
  const waiting = urgency !== null && !plots.has("additive_u");
  const rules: PersistenceRule[] = [...plots.keys(), ...(waiting ? (["additive_u"] as const) : [])];
  const [chosen, setChosen] = useState<PersistenceRule | null>(null);
  const shown = chosen !== null && plots.has(chosen) ? chosen : ([...plots.keys()][0] ?? null);
  const plot = shown ? plots.get(shown)! : null;

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
  const reasonId = useId();

  // Why the earlier method's test cannot be pressed yet: on its way, or failed with Retry, as the chart of ranks says.
  const reason = !waiting ? null : urgency.failed ? (
    <div id={reasonId} className={styles.wait} role="alert" data-region="frequency-wait" data-state="failed">
      <p>{W.urgencyFailed}</p>
      <button type="button" className={explore.retry} onClick={urgency.retry}>
        {copy.LAYOUT.retry}
      </button>
    </div>
  ) : (
    <p id={reasonId} className={styles.wait} role="status" data-region="frequency-wait" data-state="loading">
      {W.urgencyLoading}
    </p>
  );

  if (!plot)
    return (
      <figure className={explore.part} aria-labelledby={titleId} data-chart="frequencies">
        <h3 id={titleId} className={explore.partTitle}>
          {W.title}
        </h3>
        {reason ?? <p className={explore.most}>{W.none}</p>}
      </figure>
    );

  const { axis, test, words } = plot;
  const markedId = marked?.id ?? null;
  const markedTracks = markedId ? (plot.drawn.get(markedId) ?? null) : null;
  const count = axis.bins.length;
  const step = width / count;
  const bandBins = axis.bins.flatMap((bin, i) => (bin.kind === "span" && bin.band ? [i] : []));
  const style = styleFor(width);

  return (
    <figure className={explore.part} aria-labelledby={titleId} data-chart="frequencies" data-rule={shown}>
      <h3 id={titleId} className={explore.partTitle}>
        {W.title}
      </h3>
      <p className={explore.most} data-region="frequency-answer">
        {W.persistent(plot.rule, plot.persistent, words.thresholdPercent)}
      </p>
      {rules.length > 1 ? (
        <div className={styles.switch} role="group" aria-label={W.show} data-region="frequency-switch">
          <span className={styles.switchLabel} aria-hidden="true">
            {W.show}
          </span>
          <div className={styles.switchButtons}>
            {rules.map((rule) => (
              <button
                key={rule}
                type="button"
                className={styles.switchButton}
                aria-pressed={rule === shown}
                disabled={!plots.has(rule)}
                aria-describedby={plots.has(rule) ? undefined : reasonId}
                data-rule={rule}
                onClick={() => setChosen(rule)}
              >
                {copy.ruleLabel(rule)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {reason}
      {plot.rule === "additive_u" ? (
        <p className={styles.testNote} data-region="frequency-test">
          {W.urgency}
        </p>
      ) : null}
      <p className={styles.testNote}>{W.what(test.draws, test.settings.length)}</p>
      <div ref={host} className={styles.plot} aria-hidden="true">
        {width > 0
          ? plot.rows.map((columns, setting) => {
              const stack = stackDots(raised(columns, markedId), width, style);
              const base = ABOVE + Math.max(stack.height, stack.diameter);
              const markedDot = stack.dots.find((dot) => dot.item.id === markedId);
              return (
                <div key={setting} className={styles.row} data-setting={setting}>
                  <p className={styles.rowLabel}>{W.setting(test.settings, setting)}</p>
                  <svg
                    className={styles.svg}
                    width={width}
                    height={base + BELOW}
                    viewBox={`0 0 ${width} ${base + BELOW}`}
                    focusable="false"
                  >
                    {bandBins.length > 0 ? (
                      <rect
                        className={styles.band}
                        data-part="band"
                        x={bandBins[0] * step}
                        width={bandBins.length * step}
                        y={0}
                        height={base}
                      />
                    ) : null}
                    <line className={styles.baseline} x1={0} x2={width} y1={base + 0.5} y2={base + 0.5} />
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
                    <line
                      className={styles.line}
                      data-part="line"
                      x1={axis.line * step}
                      x2={axis.line * step}
                      y1={0}
                      y2={base + BELOW}
                    />
                    {/* The marked school's dot, drawn last so its ring sits over its neighbours and the line. */}
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
                </div>
              );
            })
          : null}
        {/* Each column's range under it, the line carried down between its two columns to its name. */}
        <div
          className={styles.columns}
          style={{ "--count": count } as CSSProperties}
          data-region="frequency-columns"
        >
          {axis.bins.map((bin, b) => (
            <span
              key={b}
              data-column={b}
              data-band={(bin.kind === "span" && bin.band) || undefined}
              data-line={b === axis.line || undefined}
            >
              {W.column(bin)}
            </span>
          ))}
        </div>
        <p className={styles.lineName} data-region="frequency-line">
          <span style={{ "--at": axis.line / count } as CSSProperties}>{W.line(words.thresholdPercent)}</span>
        </p>
      </div>
      <p className={explore.axis}>{W.axis}</p>
      <p className={explore.note} data-region="frequency-scale">
        {W.notToScale(words.thresholdPercent, words.band !== null)}
      </p>
      {words.band ? (
        <p className={explore.note}>{W.band(words.band.loPercent, words.band.hiPercent)}</p>
      ) : null}
      <p className={explore.note}>{W.flag}</p>
      <p className={explore.note}>{W.caveat}</p>
      {plot.undrawn.length > 0 ? <p className={explore.note}>{W.undrawn(plot.undrawn.length)}</p> : null}
      {marked ? (
        <div className={explore.chosenLine} data-region="frequency-marked">
          <span className={explore.key} data-chosen="" aria-hidden="true" />
          <div>
            <b>{names.get(marked.id)}</b>{" "}
            {markedTracks ? (
              <dl className={styles.shares}>
                {markedTracks.tracks.map((track) => (
                  <div key={track.index}>
                    <dt>{W.setting(test.settings, track.index)}</dt>
                    <dd>
                      {W.runs(track.percent)},{" "}
                      {track.reaches ? W.reaches(words.thresholdPercent) : W.below(words.thresholdPercent)}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              W.markedNone
            )}
          </div>
        </div>
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
        <table id={tableId} className={`${explore.table} ${styles.table}`}>
          <caption className={explore.srOnly}>{W.title}</caption>
          <thead>
            <tr>
              <th scope="col">{W.table.share}</th>
              {test.settings.map((_, setting) => (
                <th key={setting} scope="col">
                  {W.setting(test.settings, setting)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {axis.bins.map((bin, b) => (
              <tr key={b} data-bin={b}>
                <th scope="row">{W.bin(bin)}</th>
                {plot.rows.map((columns, setting) => {
                  const holds = markedId !== null && columns[b].some((school) => school.id === markedId);
                  return (
                    <td key={setting} data-marked={holds || undefined}>
                      {holds ? (
                        <>
                          <span
                            className={`${explore.key} ${styles.cellKey}`}
                            data-chosen=""
                            aria-hidden="true"
                          />
                          <span className={explore.srOnly}>{EXPLORE.table.marked}</span>
                        </>
                      ) : null}
                      {copy.formatCount(columns[b].length)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {plot.undrawn.length > 0 ? (
              <tr data-bin="undrawn">
                <th scope="row">{W.table.undrawn}</th>
                {test.settings.map((_, setting) => (
                  <td key={setting}>{copy.formatCount(plot.undrawn.length)}</td>
                ))}
              </tr>
            ) : null}
          </tbody>
        </table>
      ) : null}
    </figure>
  );
}
