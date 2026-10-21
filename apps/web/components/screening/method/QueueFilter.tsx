"use client";

import type { BoundCopy } from "@/lib/screening/copy";
import type { Method } from "@/lib/screening/copy/method";
import { lacks } from "@/lib/screening/method/filters";
import type { ListedRow } from "@/lib/screening/types";
import { MISSING_DETAILS, type MissingDetail } from "@/lib/screening/workspace/state";

import styles from "./method.module.css";

/**
 * The method details' filter of the incomplete records by the part of school need they lack: All, then each part
 * some record lacks, with how many do. `rows` are the incomplete records the other filters leave; the counts are
 * theirs, so a chip's count is what choosing it shows.
 */
export function QueueFilter({
  copy,
  method,
  rows,
  miss,
  onMiss,
}: {
  copy: BoundCopy;
  method: Method;
  rows: readonly ListedRow[];
  miss: MissingDetail | null;
  onMiss: (miss: MissingDetail | null) => void;
}) {
  const details = MISSING_DETAILS.map(
    (detail) => [detail, rows.filter((r) => lacks(r, detail)).length] as const
  )
    // A part no record lacks is no choice, unless a link chose it.
    .filter(([detail, n]) => n > 0 || detail === miss);
  return (
    <div className={styles.missRow}>
      <span className={styles.missLabel}>{method.queue.missingEyebrow}</span>
      <div className={styles.missChips} role="group" aria-label={method.queue.filterAria}>
        <button type="button" aria-pressed={miss === null} onClick={() => onMiss(null)}>
          {method.queue.all} <em>{copy.formatCount(rows.length)}</em>
        </button>
        {details.map(([detail, n]) => (
          <button key={detail} type="button" aria-pressed={miss === detail} onClick={() => onMiss(detail)}>
            {method.queue.parts[detail]} <em>{copy.formatCount(n)}</em>
          </button>
        ))}
      </div>
    </div>
  );
}
