"use client";

import { X } from "lucide-react";

import { placeLabel, placeOf } from "@/lib/screening/list";
import type { ListedRow } from "@/lib/screening/types";

import { COPY } from "./copy";
import styles from "./screening.module.css";

/**
 * The school card's place in the layout. It carries the identity, the place and what the place is counted among,
 * under the rule the rows on screen belong to, so a selection is visible now; the reasons, the record and the
 * numbers come with the school card change. While another rule's rows are still on screen it is dimmed and busy.
 */
export function SchoolCard({
  row,
  ruleLabel,
  stale,
  onClose,
}: {
  row: ListedRow;
  ruleLabel: string;
  stale: boolean;
  onClose: () => void;
}) {
  const place = placeOf(row);
  const { school } = row;
  return (
    <aside
      className={`${styles.panel} ${styles.card} ${stale ? styles.stale : ""}`}
      data-slot="school-card"
      aria-label={school.source_school_name}
      aria-busy={stale}
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
        <p className={styles.cardMeta} data-testid="card-rule">
          {COPY.cardRule(ruleLabel)}
        </p>
        <p className={styles.cardPlace} data-testid="card-place">
          {placeLabel(place) || COPY.cardNoPlace}
        </p>
        {place.kind === "range" && place.exact ? <p className={styles.cardMeta}>{COPY.exactRange}</p> : null}
        {place.kind !== "none" ? (
          <p className={styles.cardMeta} data-testid="card-scope">
            {COPY.cardScope(place.scope)}
          </p>
        ) : null}
        <p className={styles.slot}>{COPY.slots.card}</p>
      </div>
    </aside>
  );
}
