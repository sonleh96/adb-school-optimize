"use client";

import { X } from "lucide-react";

import { placeLabel, placeOf } from "@/lib/screening/list";
import type { ListedRow } from "@/lib/screening/types";

import { COPY } from "./copy";
import styles from "./screening.module.css";

/**
 * The school card's place in the layout. It carries the identity and the place so a selection is visible now;
 * the reasons, the record and the numbers come with the school card change.
 */
export function SchoolCard({ row, onClose }: { row: ListedRow; onClose: () => void }) {
  const place = placeLabel(placeOf(row));
  const { school } = row;
  return (
    <aside
      className={`${styles.panel} ${styles.card}`}
      data-slot="school-card"
      aria-label={school.source_school_name}
    >
      <div className={styles.cardBar}>
        <span className={styles.eyebrow}>{COPY.cardEyebrow}</span>
        <button type="button" className={styles.closeButton} aria-label={COPY.closeCard} onClick={onClose}>
          <X size={14} aria-hidden />
        </button>
      </div>
      <div className={styles.cardBody}>
        <h2 className={styles.cardName}>{school.source_school_name}</h2>
        <p className={styles.cardMeta}>{[school.district, school.province].filter(Boolean).join(", ")}</p>
        <p className={styles.cardPlace} data-testid="card-place">
          {place || COPY.cardNoPlace}
        </p>
        <p className={styles.slot}>{COPY.slots.card}</p>
      </div>
    </aside>
  );
}
