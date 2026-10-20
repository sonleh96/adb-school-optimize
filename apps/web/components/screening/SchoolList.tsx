"use client";

import { ChevronRight } from "lucide-react";
import { Fragment, type KeyboardEvent, useEffect, useRef } from "react";

import type { BoundCopy, CopyRuleId, ListedSchool } from "@/lib/screening/copy";
import { type OrderedRow, groupByProvince, incompleteInDisplayOrder, neighbour } from "@/lib/screening/list";
import type { ListedRow, QueuedRow, SchoolKey } from "@/lib/screening/types";
import { firstRangeIndex, placeForm, tieNoteAfter } from "@/lib/screening/workspace/rows";

import { COPY } from "./copy";
import { PlaceText } from "./PlaceText";
import styles from "./screening.module.css";

interface ListProps<Row extends ListedRow> {
  rows: readonly Row[];
  /** The list's schools by key, as the copy reads them. */
  schools: ReadonlyMap<string, ListedSchool>;
  copy: BoundCopy;
  selected: SchoolKey | null;
  hovered: SchoolKey | null;
  onSelect: (key: SchoolKey) => void;
  busy: boolean;
  label: string;
}

/**
 * Arrow keys move through `order`, which must be the rows as they appear on screen. They move from the row that
 * has focus, not from the selection: a key pressed straight after a click can arrive before the selection has
 * re-rendered.
 */
function arrowKeyHandler(
  order: readonly ListedRow[],
  selected: SchoolKey | null,
  onSelect: (key: SchoolKey) => void
) {
  return (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const focused = (event.target as HTMLElement).closest<HTMLElement>("[data-school-key]")?.dataset
      .schoolKey;
    const next = neighbour(order, focused ?? selected, event.key === "ArrowDown" ? 1 : -1);
    if (next === null) return;
    event.preventDefault();
    onSelect(next);
    // Focus moves with the selection at once, so the next key press starts from the new row, however fast it comes.
    event.currentTarget
      .querySelector<HTMLElement>(`[data-school-key="${CSS.escape(next)}"]`)
      ?.focus({ preventScroll: true });
  };
}

/** Keeps the selected row in view when the selection came from elsewhere (the map, the card's arrows). */
function useScrollToSelected(list: React.RefObject<HTMLElement | null>, selected: SchoolKey | null) {
  useEffect(() => {
    if (selected === null) return;
    const row = list.current?.querySelector<HTMLElement>(`[data-school-key="${CSS.escape(selected)}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [list, selected]);
}

/** The school's name as the list shows it, with its province (or district) kept whole on the line (R6). */
function NameLine({ name, place }: { name: string; place: string | null }) {
  return (
    <span className={styles.nameLine}>
      <span className={styles.name}>{name}</span>
      {place ? <span className={styles.where}>{` · ${place}`}</span> : null}
    </span>
  );
}

function Place({
  row,
  school,
  copy,
  rule,
}: {
  row: OrderedRow;
  school: ListedSchool;
  copy: BoundCopy;
  rule: CopyRuleId;
}) {
  const form = placeForm(row);
  switch (form.kind) {
    case "point":
      return (
        <span className={styles.place} data-place="point">
          <PlaceText text={copy.ordinal(form.rank)} />
        </span>
      );
    // A range school's place is the copy's headline, which always carries its range or its scope, stacked.
    case "range":
    case "scoped":
      return (
        <span className={`${styles.place} ${styles.placeRange}`} data-place={form.kind}>
          <PlaceText text={copy.placeHeadline(school, rule)} />
        </span>
      );
  }
}

export function OrderedList({
  rows,
  schools,
  copy,
  rule,
  upper,
  selected,
  hovered,
  onSelect,
  busy,
  label,
}: ListProps<OrderedRow> & { rule: CopyRuleId; upper: boolean }) {
  const list = useRef<HTMLOListElement>(null);
  const onKeyDown = arrowKeyHandler(rows, selected, onSelect);
  useScrollToSelected(list, selected);

  const all = [...schools.values()];
  const ties = rows.map((row) => copy.tieNote(schools.get(row.school.school_key)!, rule, all, "row"));
  const rangeAt = firstRangeIndex(rows);
  const tieAt = tieNoteAfter(ties.map(Boolean));

  return (
    <ol
      ref={list}
      className={styles.rows}
      aria-label={label}
      aria-busy={busy}
      data-region="ranked-list"
      onKeyDown={onKeyDown}
    >
      {rows.map((row, index) => {
        const key = row.school.school_key;
        const school = schools.get(key)!;
        return (
          <Fragment key={key}>
            {index === rangeAt ? (
              <li className={`${styles.listNote} ${styles.rangeNote}`} data-region="list-order">
                {upper ? copy.scope(rule).listOrderUpper : copy.scope(rule).listOrder}
              </li>
            ) : null}
            <li>
              <button
                type="button"
                className={styles.row}
                data-school-key={key}
                data-cohort={row.cohort}
                data-hover={key === hovered || undefined}
                aria-pressed={key === selected}
                onClick={() => onSelect(key)}
              >
                <Place row={row} school={school} copy={copy} rule={rule} />
                <span className={styles.rowText}>
                  <NameLine
                    name={copy.distinctName(school)}
                    place={school.province?.trim() ? copy.cleanName(school.province) : null}
                  />
                  {ties[index] ? <span className={styles.tie}>{ties[index]}</span> : null}
                </span>
                <ChevronRight className={styles.chevron} size={14} aria-hidden />
              </button>
            </li>
            {index === tieAt ? (
              <li className={styles.listNote} data-region="tie-rule">
                {copy.TERMS.tie_rule.line}
              </li>
            ) : null}
          </Fragment>
        );
      })}
    </ol>
  );
}

export function IncompleteList({
  rows,
  schools,
  copy,
  selected,
  hovered,
  onSelect,
  busy,
  label,
}: ListProps<QueuedRow>) {
  const list = useRef<HTMLOListElement>(null);
  // The keys follow the grouped order on screen, whatever order the rows arrived in.
  const onKeyDown = arrowKeyHandler(incompleteInDisplayOrder(rows), selected, onSelect);
  useScrollToSelected(list, selected);
  return (
    <ol
      ref={list}
      className={styles.rows}
      aria-label={label}
      aria-busy={busy}
      data-region="queue-list"
      onKeyDown={onKeyDown}
    >
      {groupByProvince(rows).map((group) => (
        <li key={group.province ?? ""}>
          <div className={styles.groupHead}>
            <span>{group.province ?? COPY.provinceUnknown}</span>
            <span className={styles.groupCount}>{copy.formatCount(group.rows.length)}</span>
          </div>
          <ol className={styles.groupRows}>
            {group.rows.map((row) => {
              const key = row.school.school_key;
              const school = schools.get(key)!;
              const district = row.school.district?.trim() ? copy.cleanName(row.school.district) : null;
              return (
                <li key={key}>
                  <button
                    type="button"
                    className={`${styles.row} ${styles.rowQueued}`}
                    data-school-key={key}
                    data-cohort={row.cohort}
                    data-hover={key === hovered || undefined}
                    aria-pressed={key === selected}
                    onClick={() => onSelect(key)}
                  >
                    <span className={styles.rowText}>
                      <NameLine name={copy.distinctName(school)} place={district} />
                      {/* What is missing from the record goes here once every school's inputs load in one read. */}
                    </span>
                    <ChevronRight className={styles.chevron} size={14} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ol>
        </li>
      ))}
    </ol>
  );
}
