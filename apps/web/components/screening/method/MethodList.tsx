"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef } from "react";

import type { BoundCopy, CopyRuleId, ListedSchool } from "@/lib/screening/copy";
import type { Method } from "@/lib/screening/copy/method";
import { type OrderedRow, neighbour } from "@/lib/screening/list";
import type { SchoolKey } from "@/lib/screening/types";

import { PlaceText } from "../PlaceText";
import base from "../screening.module.css";
import styles from "./method.module.css";

const f3 = (value: number) => value.toFixed(3);
const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Where the school's possible positions sit among all the schools that can be put in order: a bar for a range, a tick
 * for one position, with quarter marks. It carries no words; the row's place says the same in words.
 */
function Strip({
  best,
  worst,
  count,
  range,
}: {
  best: number;
  worst: number;
  count: number;
  range: boolean;
}) {
  const x = (place: number) => 1 + ((place - 1) / Math.max(1, count - 1)) * 70;
  const x0 = x(best);
  const width = Math.max(range ? 3 : 2, x(worst) - x0);
  return (
    <svg className={styles.strip} width="72" height="14" viewBox="0 0 72 14" aria-hidden>
      <line x1="1" x2="71" y1="7" y2="7" stroke="rgba(21,24,29,.16)" />
      {[0.25, 0.5, 0.75].map((q) => (
        <line key={q} x1={1 + q * 70} x2={1 + q * 70} y1="4" y2="10" stroke="rgba(21,24,29,.14)" />
      ))}
      {range ? (
        <rect x={x0} y="2.5" width={width} height="9" rx="1" className={styles.stripRange} />
      ) : (
        <rect x={width === 2 ? x0 - 1 : x0} y="3.5" width={width} height="7" rx="1" fill="#4a4f57" />
      )}
    </svg>
  );
}

export interface MethodListProps {
  rows: readonly OrderedRow[];
  /** Every school that can be put in order, filters aside: the strip's scale. */
  count: number;
  schools: ReadonlyMap<string, ListedSchool>;
  copy: BoundCopy;
  method: Method;
  rule: CopyRuleId;
  selected: SchoolKey | null;
  hovered: SchoolKey | null;
  busy: boolean;
  label: string;
  onSelect: (key: SchoolKey) => void;
}

/**
 * The list as the method details show it: each place as a bare number (a range in words), the school's district and
 * province, its score (school need under the need-first rules) and where it sits among every school that
 * can be put in order. The arrow keys move through the rows on screen, as in the plain list.
 */
export function MethodList({
  rows,
  count,
  schools,
  copy,
  method,
  rule,
  selected,
  hovered,
  busy,
  label,
  onSelect,
}: MethodListProps) {
  const list = useRef<HTMLOListElement>(null);
  const { TERMS, LAYOUT, STRINGS } = copy;
  // A need-first rule orders by school need first, and the API says so by giving each row a primary sort key.
  const needFirst = rows.some((row) => row.scores.sort_key_primary !== null);

  useEffect(() => {
    if (selected === null) return;
    list.current
      ?.querySelector<HTMLElement>(`[data-school-key="${CSS.escape(selected)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const onKeyDown = (event: KeyboardEvent<HTMLOListElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const focused = (event.target as HTMLElement).closest<HTMLElement>("[data-school-key]")?.dataset
      .schoolKey;
    const next = neighbour(rows, focused ?? selected, event.key === "ArrowDown" ? 1 : -1);
    if (next === null) return;
    event.preventDefault();
    onSelect(next);
    event.currentTarget
      .querySelector<HTMLElement>(`[data-school-key="${CSS.escape(next)}"]`)
      ?.focus({ preventScroll: true });
  };

  return (
    <>
      <div className={styles.cols} aria-hidden>
        <span className={styles.colPlace}>{TERMS.rank.label}</span>
        <span className={styles.right}>{needFirst ? TERMS.school_need.label : TERMS.score.label}</span>
        <span>{LAYOUT.amongAll124}</span>
      </div>
      <ol
        ref={list}
        className={`${base.rows} ${styles.rows}`}
        aria-label={label}
        aria-busy={busy}
        data-region="ranked-list"
        onKeyDown={onKeyDown}
      >
        {rows.map((row) => {
          const key = row.school.school_key;
          const school = schools.get(key)!;
          const where = copy.locationLine(school);
          const range = row.cohort === "interval";
          const exact = range && row.rank_bounds.best === row.rank_bounds.worst;
          const value = needFirst ? row.scores.sort_key_primary : row.scores.point;
          const missing = range
            ? (
                [
                  ["aqi", TERMS.air_quality.label],
                  ["emissions", TERMS.emissions.label],
                  ["land", TERMS.land_cover.label],
                ] as const
              )
                .filter(([field]) => school.missing_env[field])
                .map(([, name]) => `${name}: ${lcFirst(STRINGS.noReading)}`)
                .join(", ")
            : "";
          return (
            <li key={key}>
              <button
                type="button"
                className={`${base.row} ${styles.row}`}
                data-school-key={key}
                data-cohort={row.cohort}
                data-region={range ? "range-row" : undefined}
                data-hover={key === hovered || undefined}
                aria-pressed={key === selected}
                onClick={() => onSelect(key)}
              >
                <span
                  className={styles.place}
                  data-range={range || undefined}
                  data-place={range ? "range" : "point"}
                >
                  {range ? (
                    <PlaceText text={copy.placeHeadline(school, rule)} />
                  ) : (
                    String(row.point_rank.rank)
                  )}
                </span>
                <span className={styles.nameCell}>
                  <span className={base.name}>{copy.distinctName(school)}</span>
                  <span className={styles.sub}>
                    {missing ? (
                      <span className={styles.tag}>
                        {missing}
                        {exact ? `, ${method.sameEitherWay}` : ""}
                      </span>
                    ) : null}
                    {missing && where ? " · " : null}
                    {where}
                  </span>
                </span>
                <span
                  className={styles.score}
                  title={
                    value === null && row.scores.lower !== null && row.scores.upper != null
                      ? LAYOUT.valueRange(f3(row.scores.lower), f3(row.scores.upper))
                      : undefined
                  }
                >
                  {value !== null ? f3(value) : method.list.range}
                </span>
                <Strip
                  best={row.rank_bounds.best}
                  worst={row.rank_bounds.worst}
                  count={count}
                  range={range}
                />
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** The method details' list head: the filters in force, which group places count among, and the range order. */
export function MethodListHead({
  copy,
  method,
  rule,
  shown,
  total,
  hasRanges,
  upper,
  filters,
  filterOpen,
  filterButton,
  onFilter,
  onClear,
  onPlace,
}: {
  copy: BoundCopy;
  method: Method;
  rule: CopyRuleId;
  shown: number;
  total: number;
  hasRanges: boolean;
  upper: boolean;
  filters: { prov: string | null; loc: string | null };
  filterOpen: boolean;
  filterButton: React.RefObject<HTMLButtonElement | null>;
  onFilter: () => void;
  onClear: (key: "prov" | "loc") => void;
  onPlace: () => void;
}) {
  const scope = copy.scope(rule);
  const { TERMS } = copy;
  const chips = [
    filters.prov !== null ? (["prov", method.filter.chipProvince(filters.prov)] as const) : null,
    filters.loc !== null ? (["loc", method.filter.chipLocality(filters.loc)] as const) : null,
  ].filter((chip) => chip !== null);
  const active = chips.length;
  return (
    <header className={`${base.listHead} ${styles.head}`} data-region="scope">
      {active ? (
        <div className={styles.chips} aria-label={method.filter.chipsAria}>
          {chips.map(([key, text]) => (
            <button
              key={key}
              type="button"
              className={styles.chip}
              aria-label={method.filter.remove(text)}
              onClick={() => onClear(key)}
            >
              {text}
              <X size={10} aria-hidden />
            </button>
          ))}
        </div>
      ) : null}
      <button
        ref={filterButton}
        type="button"
        className={styles.filterButton}
        data-region="filters"
        aria-expanded={filterOpen}
        aria-controls="screening-filters"
        aria-label={active ? `${TERMS.filters.label} (${active})` : TERMS.filters.label}
        title={active ? `${TERMS.filters.label} (${active})` : TERMS.filters.label}
        onClick={onFilter}
      >
        <SlidersHorizontal size={14} aria-hidden />
        {active ? <span className={styles.filterCount}>{active}</span> : null}
      </button>
      {active ? (
        <p className={`${base.scopeLine} ${styles.filtered}`}>
          {shown < total ? `${method.queue.showing(shown, total)} ` : ""}
          {scope.filterNote}
        </p>
      ) : (
        <p className={base.scopeLine} data-term={hasRanges ? "cohort_ranked" : "cohort_complete"}>
          {hasRanges ? scope.scopeRanked : scope.scopeComplete}
        </p>
      )}
      {hasRanges ? (
        <p className={`${base.scopeLine} ${styles.placeLine}`} data-region="list-order">
          {upper ? scope.listOrderUpper : scope.listOrder}{" "}
          <button type="button" className={base.linkButton} onClick={onPlace}>
            {upper ? method.list.toLower : method.list.toUpper}
          </button>
        </p>
      ) : null}
    </header>
  );
}
