import { RAMP_HEX } from "@/lib/screening/marks";

import { COPY } from "./copy";
import styles from "./screening.module.css";

/**
 * Names the rule the marks on the map belong to, taken from the rows on screen (never from the rule just asked
 * for), and is dimmed and busy while another rule's rows are still showing.
 */
export function Legend({ ruleLabel, stale }: { ruleLabel: string; stale: boolean }) {
  return (
    <section
      className={`${styles.panel} ${styles.legend} ${stale ? styles.stale : ""}`}
      data-slot="legend"
      aria-label={COPY.legendLabel}
      aria-busy={stale}
    >
      <div className={styles.legendTitle} data-testid="legend-rule">
        <b>{COPY.legend.place}</b>
        {ruleLabel ? ` · ${ruleLabel}` : ""}
      </div>
      <div className={styles.ramp}>
        {COPY.legend.steps.map((step, index) => (
          <span key={step}>
            <i style={{ background: RAMP_HEX[index] }} />
            {step}
          </span>
        ))}
      </div>
      <div className={styles.legendRow}>
        <span className={styles.key}>
          <span className={styles.markRange} aria-hidden />
          {COPY.legend.range}
        </span>
        <span className={styles.key}>
          <span className={styles.markIncomplete} aria-hidden />
          {COPY.legend.incomplete}
        </span>
      </div>
    </section>
  );
}
