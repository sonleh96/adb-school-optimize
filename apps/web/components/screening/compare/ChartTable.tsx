"use client";

import { type KeyboardEvent, useRef } from "react";

import type { BoundCopy, CopyRuleId } from "@/lib/screening/copy";
import type { Method } from "@/lib/screening/copy/method";
import type { Compared } from "@/lib/screening/method/compare";
import type { SchoolKey } from "@/lib/screening/types";

import styles from "./compare.module.css";

/**
 * What the compare chart shows, as a table a screen reader reads and a keyboard moves through: every school both
 * rules put in order, its place under each rule and how far it moved. The chart is hidden from assistive technology;
 * this is its text. One school's button is in the tab order at a time, the arrow keys move between them, and choosing
 * one opens its card, as a click on the chart does. Out of sight until focus enters it, then shown under the chart.
 */
export function ChartTable({
  copy,
  words,
  a,
  b,
  data,
  names,
  label,
  selected,
  onSelect,
}: {
  copy: BoundCopy;
  words: Method;
  a: CopyRuleId;
  b: CopyRuleId;
  data: Compared;
  names: ReadonlyMap<string, string>;
  label: string;
  selected: SchoolKey | null;
  onSelect: (key: SchoolKey) => void;
}) {
  const body = useRef<HTMLTableSectionElement>(null);
  const rows = data.byA;
  const current = rows.some((r) => r.key === selected) ? selected : (rows[0]?.key ?? null);

  const onKeyDown = (event: KeyboardEvent<HTMLTableSectionElement>) => {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const buttons = [...(body.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const at = buttons.indexOf(event.target as HTMLButtonElement);
    if (at < 0) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : Math.max(0, Math.min(buttons.length - 1, at + (event.key === "ArrowDown" ? 1 : -1)));
    buttons.forEach((button, i) => (button.tabIndex = i === next ? 0 : -1));
    buttons[next]?.focus();
  };

  return (
    <table className={styles.chartTable} aria-label={label}>
      <thead>
        <tr>
          <th scope="col">{words.compare.table.school}</th>
          <th scope="col">{words.compare.table.place(copy.ruleShortName(a))}</th>
          <th scope="col">{words.compare.table.place(copy.ruleShortName(b))}</th>
          <th scope="col">{words.compare.table.move}</th>
        </tr>
      </thead>
      <tbody ref={body} onKeyDown={onKeyDown}>
        {rows.map((r) => (
          <tr key={r.key} data-on={r.key === selected || undefined}>
            <th scope="row">
              <button
                type="button"
                tabIndex={r.key === current ? 0 : -1}
                aria-pressed={r.key === selected}
                onClick={() => onSelect(r.key)}
              >
                {names.get(r.key) ?? r.name}
              </button>
            </th>
            <td>{r.a}</td>
            <td>{r.b}</td>
            <td>
              {r.d === 0
                ? words.samePlaceUnder(copy.ruleShortName(b))
                : words.compare.moveWords(r.d, copy.ruleShortName(b))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
