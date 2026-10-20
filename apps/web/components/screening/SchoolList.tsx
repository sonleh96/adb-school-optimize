"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";

import { type OrderedRow, groupByProvince, neighbour, ordinal, placeOf } from "@/lib/screening/list";
import type { ListedRow, QueuedRow, SchoolKey } from "@/lib/screening/types";

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
    if (place.best === place.worst) {
      return (
        <span className={styles.place} data-place="range">
          <Ordinal n={place.best} />
        </span>
      );
    }
    return (
      <span className={`${styles.place} ${styles.placeRange}`} data-place="range">
        <span>
          <Ordinal n={place.best} />
        </span>
        <span className={styles.placeTo}>to</span>
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

/** Arrow keys move the selection through the rows on screen; the selected row keeps focus. */
function arrowKeyHandler(
  rows: readonly ListedRow[],
  selected: SchoolKey | null,
  onSelect: (key: SchoolKey) => void
) {
  return (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const next = neighbour(rows, selected, event.key === "ArrowDown" ? 1 : -1);
    if (next === null) return;
    event.preventDefault();
    onSelect(next);
    const list = event.currentTarget;
    requestAnimationFrame(() => {
      list
        .querySelector<HTMLElement>(`[data-school-key="${CSS.escape(next)}"]`)
        ?.focus({ preventScroll: true });
    });
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
  return (
    <ol ref={list} className={styles.list} aria-label={label} aria-busy={busy} onKeyDown={onKeyDown}>
      {rows.map((row) => {
        const key = row.school.school_key;
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
  const onKeyDown = arrowKeyHandler(rows, selected, onSelect);
  useScrollToSelected(list, selected);
  return (
    <ol ref={list} className={styles.list} aria-label={label} aria-busy={busy} onKeyDown={onKeyDown}>
      {groupByProvince(rows).map((group) => (
        <li key={group.province ?? ""}>
          <div className={styles.groupHead}>{group.province ?? "Province not recorded"}</div>
          <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
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
