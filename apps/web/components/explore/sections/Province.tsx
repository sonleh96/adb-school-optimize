"use client";

import { type CSSProperties, useId, useMemo, useState } from "react";

import { provinceCounts, provinceOf, ranksOf, totalOf, waiting } from "@/lib/explore/province";
import { EXPLORE } from "@/lib/screening/copy/explore";
import { EXPLORE_PROVINCE as WORDS } from "@/lib/screening/copy/explore-province";
import { formatCount } from "@/lib/screening/copy/format";
import type { CopyRuleId } from "@/lib/screening/copy/model";
import type { ListedRow } from "@/lib/screening/types";

import explore from "../explore.module.css";
import styles from "./province.module.css";

/** The school marked across the page, by its key and the name the page shows it by. */
export interface MarkedSchool {
  readonly id: string;
  readonly name: string;
}

/**
 * Where the schools are: one row per province, from A to Z, with the records that give no province last. Each row has
 * two bars on one scale: the schools in the list, its top-20 part in navy from the baseline, and the records not in
 * the list yet, drawn empty as the map draws them. The marked school's province is washed and keyed in navy. The
 * drawing is hidden from assistive technology; the words around it and its two tables say everything it shows.
 */
export function Province({
  rows,
  rule,
  marked,
}: {
  /** The whole list of the rule shown, every row of it. */
  rows: readonly ListedRow[];
  rule: CopyRuleId;
  marked: MarkedSchool | null;
}) {
  const counts = useMemo(() => provinceCounts(rows), [rows]);
  const view = useMemo(() => {
    const named = counts.filter((count) => count.province !== null);
    const unrecorded = counts.find((count) => count.province === null);
    const total = totalOf(counts);
    const ranks = ranksOf(rows);
    return {
      total,
      // The longest bar on either side sets the scale both share, so one length is one count everywhere.
      most: Math.max(1, ...counts.map((count) => Math.max(count.inList, waiting(count.notYet)))),
      answer: WORDS.answer(
        named.length,
        named.filter((count) => count.inList > 0).length,
        unrecorded?.inList ?? 0
      ),
      order: WORDS.order(unrecorded !== undefined),
      top: [WORDS.top(ranks.complete, rule), WORDS.ranges(ranks.range, ranks.reach)]
        .filter((sentence) => sentence !== null)
        .join(" "),
      reasons: WORDS.reasons(
        waiting(total.notYet),
        total.notYet.missingField,
        total.notYet.zeroClassrooms,
        total.notYet.other
      ),
    };
  }, [counts, rows, rule]);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const tablesId = useId();

  // The marked school is always one of the list: the picker offers no other.
  const markedRow = marked ? rows.find((row) => row.school.school_key === marked.id) : undefined;
  const home = markedRow ? counts.find((count) => count.province === provinceOf(markedRow)) : undefined;
  const { total } = view;
  const nameOf = (province: string | null) => province ?? WORDS.unrecorded;
  const markedNote = <span className={explore.marked}>{EXPLORE.table.marked}</span>;

  return (
    <section className={explore.section} aria-labelledby="explore-province" data-region="province">
      <h2 id="explore-province" className={explore.question}>
        {WORDS.question}
      </h2>
      <p className={explore.sectionLede} data-region="province-answer">
        {view.answer}
      </p>
      <figure className={`${explore.part} ${styles.card}`} aria-labelledby={titleId}>
        <h3 id={titleId} className={explore.partTitle}>
          {WORDS.title}
        </h3>
        <p className={explore.most}>{view.order}</p>
        <p className={styles.legend} aria-hidden="true">
          <span>
            <span className={styles.swatch} data-kind="top" />
            {WORDS.legend.top}
          </span>
          <span>
            <span className={styles.swatch} data-kind="list" />
            {WORDS.legend.others}
          </span>
          <span>
            <span className={styles.swatch} data-kind="waiting" />
            {WORDS.legend.notYet}
          </span>
        </p>
        <div
          className={styles.chart}
          aria-hidden="true"
          data-region="province-chart"
          style={{ "--most": view.most } as CSSProperties}
        >
          <div className={styles.head}>
            <span />
            <span>{WORDS.columns.inList}</span>
            <span>{WORDS.columns.notYet}</span>
          </div>
          {counts.map((count) => {
            const rest = count.inList - count.top20;
            const queue = waiting(count.notYet);
            return (
              <div
                key={count.province ?? ""}
                className={styles.row}
                data-province={nameOf(count.province)}
                data-marked={count === home || undefined}
              >
                <span className={styles.name}>
                  {count === home ? <span className={explore.key} data-chosen="" /> : null}
                  {nameOf(count.province)}
                </span>
                <span className={styles.cell} data-side="list">
                  {count.inList > 0 ? (
                    <span className={styles.bar} style={{ "--n": count.inList } as CSSProperties}>
                      {count.top20 > 0 ? (
                        <span className={styles.top} style={{ flexGrow: count.top20 }} data-segment="top">
                          {/* The top 20's own count, where it fits inside its part and the bar's end says
                              something else. */}
                          {rest > 0 ? (
                            <span className={styles.inside} data-digits={String(count.top20).length}>
                              {formatCount(count.top20)}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                      {rest > 0 ? (
                        <span className={styles.rest} style={{ flexGrow: rest }} data-segment="rest" />
                      ) : null}
                    </span>
                  ) : null}
                  <span className={styles.value}>{formatCount(count.inList)}</span>
                </span>
                <span className={styles.cell} data-side="waiting">
                  {queue > 0 ? (
                    <span className={styles.waiting} style={{ "--n": queue } as CSSProperties} />
                  ) : null}
                  <span className={styles.value}>{formatCount(queue)}</span>
                </span>
              </div>
            );
          })}
        </div>
        <p className={styles.note} data-region="province-top">
          {view.top}
        </p>
        <p className={styles.note} data-region="province-reasons">
          {view.reasons}
        </p>
        {marked && home ? (
          <p className={explore.chosenLine} data-region="province-marked">
            <span className={explore.key} data-chosen="" aria-hidden="true" />
            <span>
              <b>{marked.name}</b> {WORDS.marked(home.province, home.inList)}
            </span>
          </p>
        ) : null}
        <button
          type="button"
          className={explore.toggle}
          aria-expanded={open}
          aria-controls={open ? tablesId : undefined}
          onClick={() => setOpen((was) => !was)}
        >
          {open ? EXPLORE.table.hide : EXPLORE.table.show}
        </button>
        {open ? (
          <div id={tablesId} className={styles.tables}>
            <table className={explore.table} data-region="province-table">
              <caption className={explore.srOnly}>{WORDS.title}</caption>
              <thead>
                <tr>
                  <th scope="col">{WORDS.table.province}</th>
                  <th scope="col">{WORDS.table.inList}</th>
                  <th scope="col">{WORDS.table.top}</th>
                  <th scope="col">{WORDS.table.notYet}</th>
                </tr>
              </thead>
              <tbody>
                {counts.map((count) => (
                  <tr key={count.province ?? ""} data-marked={count === home || undefined}>
                    <th scope="row">
                      {nameOf(count.province)}
                      {count === home ? markedNote : null}
                    </th>
                    <td>{formatCount(count.inList)}</td>
                    <td>{formatCount(count.top20)}</td>
                    <td>{formatCount(waiting(count.notYet))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">{WORDS.table.total}</th>
                  <td>{formatCount(total.inList)}</td>
                  <td>{formatCount(total.top20)}</td>
                  <td>{formatCount(waiting(total.notYet))}</td>
                </tr>
              </tfoot>
            </table>
            {waiting(total.notYet) > 0 ? (
              <table className={explore.table} data-region="province-reasons-table">
                <caption className={styles.caption}>{WORDS.table.reasons}</caption>
                <thead>
                  <tr>
                    <th scope="col">{WORDS.table.province}</th>
                    <th scope="col">{WORDS.table.missing}</th>
                    <th scope="col">{WORDS.table.zero}</th>
                    <th scope="col">{WORDS.table.other}</th>
                  </tr>
                </thead>
                <tbody>
                  {counts
                    .filter((count) => waiting(count.notYet) > 0)
                    .map((count) => (
                      <tr key={count.province ?? ""} data-marked={count === home || undefined}>
                        <th scope="row">
                          {nameOf(count.province)}
                          {count === home ? markedNote : null}
                        </th>
                        <td>{formatCount(count.notYet.missingField)}</td>
                        <td>{formatCount(count.notYet.zeroClassrooms)}</td>
                        <td>{formatCount(count.notYet.other)}</td>
                      </tr>
                    ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">{WORDS.table.total}</th>
                    <td>{formatCount(total.notYet.missingField)}</td>
                    <td>{formatCount(total.notYet.zeroClassrooms)}</td>
                    <td>{formatCount(total.notYet.other)}</td>
                  </tr>
                </tfoot>
              </table>
            ) : null}
          </div>
        ) : null}
      </figure>
    </section>
  );
}
