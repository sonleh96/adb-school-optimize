"use client";

import { memo } from "react";

import styles from "./screening.module.css";

export interface PrintRow {
  readonly key: string;
  readonly cells: readonly string[];
}

/**
 * The printout: the list on screen, whole and filtered as it is, under the lines that say what it is (the method, the
 * date, the data version, the filter and the caveat). The screen never shows it; the print stylesheet shows it alone,
 * without the controls or the map, so a printout holds every school in the list and not one window of it.
 */
export const PrintView = memo(function PrintView({
  kind,
  title,
  lines,
  columns,
  rows,
}: {
  /** The ordered list, or the records to verify: the table's columns differ. */
  kind: "list" | "queue";
  title: string;
  lines: readonly string[];
  columns: readonly string[];
  rows: readonly PrintRow[];
}) {
  return (
    <section className={styles.print} data-region="print" aria-label={title}>
      <h2 className={styles.printTitle}>{title}</h2>
      {lines.map((line) => (
        <p key={line} className={styles.printLine}>
          {line}
        </p>
      ))}
      <table className={styles.printTable} data-kind={kind}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              {row.cells.map((cell, index) => (
                <td key={index}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
});
