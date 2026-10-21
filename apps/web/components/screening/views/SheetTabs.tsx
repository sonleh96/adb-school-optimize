"use client";

/**
 * What the export sheet downloads: the top list, or the saved views for meetings (notes/final.md, "Export sheet").
 * Two pressed-state buttons in a named group, like the sheet's own 10, 20 or 30, since the choice changes the whole
 * sheet rather than a panel beside the buttons.
 */
import type { BoundCopy } from "@/lib/screening/copy";

import styles from "./views.module.css";

export function SheetTabs({
  copy,
  pack,
  onTab,
}: {
  copy: BoundCopy;
  pack: boolean;
  onTab: (pack: boolean) => void;
}) {
  const { TERMS, LAYOUT } = copy;
  return (
    <div className={styles.tabs} role="group" aria-label={LAYOUT.downloadKindAria}>
      <button type="button" aria-pressed={!pack} onClick={() => onTab(false)}>
        {TERMS.shortlist.label}
      </button>
      <button type="button" aria-pressed={pack} data-region="pack-tab" onClick={() => onTab(true)}>
        {TERMS.briefing_stops.label}
      </button>
    </div>
  );
}
