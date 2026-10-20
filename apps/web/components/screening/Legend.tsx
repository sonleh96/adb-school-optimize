import { RAMP_HEX } from "@/lib/screening/marks";

import { COPY } from "./copy";
import styles from "./screening.module.css";

export function Legend({ ruleLabel }: { ruleLabel: string }) {
  return (
    <section className={`${styles.panel} ${styles.legend}`} data-slot="legend" aria-label="Legend">
      <div className={styles.legendTitle}>
        <b>{COPY.legend.place}</b> · {ruleLabel}
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
