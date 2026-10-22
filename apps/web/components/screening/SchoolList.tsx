"use client";

import { ChevronRight } from "lucide-react";
import { Fragment, type KeyboardEvent, useEffect, useRef } from "react";

import type { BoundCopy, CopyRuleId, CopySchool } from "@/lib/screening/copy";
import { type OrderedRow, neighbour } from "@/lib/screening/list";
import type { ListedRow, QueuedRow, SchoolKey } from "@/lib/screening/types";
import type { QueueGrouping } from "@/lib/screening/workspace/state";
import { firstRangeIndex, groupRows, placeForm, tieNoteAfter } from "@/lib/screening/workspace/rows";

import { PlaceText } from "./PlaceText";
import { Sentence } from "./Sentence";
import styles from "./screening.module.css";

interface ListProps<Row extends ListedRow> {
  rows: readonly Row[];
  /** The list's schools by key: whole records, from every school's stored inputs. */
  schools: ReadonlyMap<string, CopySchool>;
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

const cleaned = (copy: BoundCopy, value: string | null) => (value?.trim() ? copy.cleanName(value) : null);

/**
 * Why a school sits where it does, in one line: the input that adds most for a school with one position; for a range
 * school, why it shows a range, naming every reading it lacks when it lacks more than one.
 */
function whyLine(copy: BoundCopy, school: CopySchool, rule: CopyRuleId): string {
  const unread = school.cohort === "interval" ? copy.rangeRowWhy(school) : null;
  if (unread) return unread;
  return copy.topDrivers(school, rule)[0]?.sentence ?? copy.reasonSentence(school, rule);
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
  const ties = rows.map((row) =>
    copy.segments.tieNote(schools.get(row.school.school_key)!, rule, all, "row")
  );
  const rangeAt = firstRangeIndex(rows);
  // The tie rule ("the name decides") holds for exact ties of the score. Under a need-first rule a row's
  // marker means the same school need, which the other inputs settle, so the sentence would mislead there.
  const needFirst = rule === "need_first_u" || rule === "need_first_no_u";
  const tieAt = needFirst ? -1 : tieNoteAfter(ties.map(Boolean));

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
        const form = placeForm(row);
        return (
          <Fragment key={key}>
            {index === rangeAt ? (
              <li className={`${styles.listNote} ${styles.rangeNote}`} data-region="list-order">
                {/* The map key's mark for a range, so the list and the key show one sign for it. */}
                <span className={styles.keyMark} data-mark="range" aria-hidden />
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
                <span
                  className={`${styles.place} ${form.kind === "point" ? "" : styles.placeRange}`}
                  data-place={form.kind}
                >
                  <PlaceText text={copy.rowPlace(school, rule)} />
                </span>
                <span className={styles.rowText}>
                  <NameLine name={copy.distinctName(school)} place={cleaned(copy, school.province)} />
                  {ties[index] ? (
                    <span className={styles.tie}>
                      <Sentence segments={ties[index]!} />
                    </span>
                  ) : null}
                  <span className={styles.rowWhy} data-region="row-why">
                    <b className={styles.rowWhyKey}>{copy.LAYOUT.whyKey}</b> {whyLine(copy, school, rule)}
                  </span>
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

/** The incomplete records, grouped as asked, in the order the arrow keys follow. */
export function incompleteGroups(
  rows: readonly QueuedRow[],
  schools: ReadonlyMap<string, CopySchool>,
  copy: BoundCopy,
  grouping: QueueGrouping
) {
  return grouping === "evidence"
    ? groupRows(rows, (row) => copy.missingGroupLabel(schools.get(row.school.school_key)!), true)
    : groupRows(rows, (row) => copy.provinceHeading(row.school.province), false);
}

export function IncompleteList({
  rows,
  schools,
  copy,
  grouping,
  selected,
  hovered,
  onSelect,
  busy,
  label,
}: ListProps<QueuedRow> & { grouping: QueueGrouping }) {
  const list = useRef<HTMLOListElement>(null);
  const groups = incompleteGroups(rows, schools, copy, grouping);
  // The keys follow the grouped order on screen, whatever order the rows arrived in.
  const onKeyDown = arrowKeyHandler(
    groups.flatMap((group) => group.rows),
    selected,
    onSelect
  );
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
      {groups.map((group) => (
        <li key={group.heading}>
          <div className={styles.groupHead}>
            <span>{group.heading}</span>
            <span className={styles.groupCount}>{copy.formatCount(group.rows.length)}</span>
          </div>
          <ol className={styles.groupRows}>
            {group.rows.map((row) => {
              const key = row.school.school_key;
              const school = schools.get(key)!;
              // Grouped by what is missing, the row names its position instead, since the heading names the gap.
              const where =
                grouping === "evidence" ? copy.locationLine(school) : cleaned(copy, row.school.district);
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
                      <NameLine name={copy.distinctName(school)} place={where} />
                      <span className={styles.rowChips} data-region="queue-chips">
                        {copy.missingLabels(school).map((chip) => (
                          <span key={chip} className={styles.rowChip}>
                            {chip}
                          </span>
                        ))}
                      </span>
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
