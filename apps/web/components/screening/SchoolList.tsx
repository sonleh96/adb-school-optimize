"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";

import {
  type OrderedRow,
  groupByProvince,
  incompleteInDisplayOrder,
  neighbour,
  ordinal,
  placeOf,
} from "@/lib/screening/list";
import type { ListedRow, QueuedRow, SchoolKey } from "@/lib/screening/types";

import { COPY } from "./copy";
import styles from "./screening.module.css";

/** "3rd" with the suffix raised, as the design sets places. */
function Ordinal({ n }: { n: number }) {
  const text = ordinal(n);
  const digits = String(n).length;
  return (
    <>
      {text.slice(0, digits)}
      <sup>{text.slice(digits)}</sup>
    </>
  );
}

function Place({ row }: { row: OrderedRow }) {
  const place = placeOf(row);
  if (place.kind === "point") {
    return (
      <span className={styles.place} data-place="point">
        <Ordinal n={place.rank} />
      </span>
    );
  }
  if (place.kind === "range") {
    // A range stays a range when both ends are the same place; it reads as that place, in the range colour.
    if (place.exact) {
      return (
        <span className={`${styles.place} ${styles.placeRange}`} data-place="range" data-exact="true">
          <span>
            <Ordinal n={place.best} />
          </span>
        </span>
      );
    }
    return (
      <span className={`${styles.place} ${styles.placeRange}`} data-place="range">
        <span>
          <Ordinal n={place.best} />
        </span>
        <span className={styles.placeTo}>{COPY.rangeTo}</span>
        <span>
          <Ordinal n={place.worst} />
        </span>
      </span>
    );
  }
  return null;
}

interface ListProps<Row extends ListedRow> {
  rows: readonly Row[];
  selected: SchoolKey | null;
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

/** Keeps the selected row in view when the selection came from the map. */
function useScrollToSelected(list: React.RefObject<HTMLOListElement | null>, selected: SchoolKey | null) {
  useEffect(() => {
    if (selected === null) return;
    const row = list.current?.querySelector<HTMLElement>(`[data-school-key="${CSS.escape(selected)}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [list, selected]);
}

export function OrderedList({ rows, selected, onSelect, busy, label }: ListProps<OrderedRow>) {
  const list = useRef<HTMLOListElement>(null);
  const onKeyDown = arrowKeyHandler(rows, selected, onSelect);
  useScrollToSelected(list, selected);
  if (rows.length === 0) return <p className={styles.state}>{COPY.noRows}</p>;
  return (
    <ol ref={list} className={styles.list} aria-label={label} aria-busy={busy} onKeyDown={onKeyDown}>
      {rows.map((row) => {
        const key = row.school.school_key;
        const exact = row.cohort === "interval" && row.rank_bounds.best === row.rank_bounds.worst;
        return (
          <li key={key}>
            <button
              type="button"
              className={styles.row}
              data-school-key={key}
              data-cohort={row.cohort}
              aria-pressed={key === selected}
              onClick={() => onSelect(key)}
            >
              <Place row={row} />
              <span>
                <span className={styles.name}>{row.school.source_school_name}</span>
                {row.school.province ? (
                  <span className={styles.province}> · {row.school.province}</span>
                ) : null}
                {exact ? <span className={styles.rangeNote}>{COPY.exactRange}</span> : null}
                {/* The "Why" line goes here with the copy system. */}
              </span>
              <ChevronRight className={styles.chevron} size={14} aria-hidden />
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function IncompleteList({ rows, selected, onSelect, busy, label }: ListProps<QueuedRow>) {
  const list = useRef<HTMLOListElement>(null);
  // The keys follow the grouped order on screen, whatever order the rows arrived in.
  const onKeyDown = arrowKeyHandler(incompleteInDisplayOrder(rows), selected, onSelect);
  useScrollToSelected(list, selected);
  if (rows.length === 0) return <p className={styles.state}>{COPY.noRows}</p>;
  return (
    <ol ref={list} className={styles.list} aria-label={label} aria-busy={busy} onKeyDown={onKeyDown}>
      {groupByProvince(rows).map((group) => (
        <li key={group.province ?? ""}>
          <div className={styles.groupHead}>{group.province ?? COPY.provinceUnknown}</div>
          <ol className={styles.groupRows}>
            {group.rows.map((row) => {
              const key = row.school.school_key;
              return (
                <li key={key}>
                  <button
                    type="button"
                    className={`${styles.row} ${styles.rowQueued}`}
                    data-school-key={key}
                    data-cohort={row.cohort}
                    aria-pressed={key === selected}
                    onClick={() => onSelect(key)}
                  >
                    <span>
                      <span className={styles.name}>{row.school.source_school_name}</span>
                      {row.school.district ? (
                        <span className={styles.province}> · {row.school.district}</span>
                      ) : null}
                      {/* What is missing from the record goes here with the copy system. */}
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
