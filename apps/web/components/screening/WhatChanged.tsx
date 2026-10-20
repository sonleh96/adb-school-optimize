"use client";

import {
  type BoundCopy,
  type CopyRuleId,
  DEFAULT_RULE,
  PROPOSED_RULE,
  type ListedSchool,
} from "@/lib/screening/copy";

import { exampleSchool } from "@/lib/screening/workspace/teaching";

import styles from "./screening.module.css";

const isUrgencyPair = (a: CopyRuleId, b: CopyRuleId) =>
  (a === DEFAULT_RULE && b === PROPOSED_RULE) || (a === PROPOSED_RULE && b === DEFAULT_RULE);

/**
 * What changed after a rule change: it answers the click the user just made, at the top of the list.
 * One agreement framing per screen: the two main rules speak through `urgencyReassurance`, any other pair through
 * `comparisonSentence`. The example is a teaching school chosen from the loaded data by its role, never by name.
 */
export function WhatChanged({
  copy,
  from,
  to,
  schools,
  onHide,
  onBack,
}: {
  copy: BoundCopy;
  from: CopyRuleId;
  to: CopyRuleId;
  schools: readonly ListedSchool[];
  onHide: () => void;
  onBack: () => void;
}) {
  const { LAYOUT, STRINGS } = copy;
  const pair = isUrgencyPair(from, to);
  const lead = pair ? copy.urgencyReassurance() : copy.comparisonSentence(from, to);
  const example = pair ? exampleSchool(schools, from, to) : null;
  return (
    <section className={styles.changed} data-region="what-changed" aria-label={LAYOUT.whatChanged}>
      <div className={styles.changedTop}>
        <span className={`${styles.eyebrow} ${styles.eyebrowNavy}`}>{LAYOUT.whatChanged}</span>
        <button type="button" className={styles.linkButton} onClick={onHide}>
          {LAYOUT.hideComparison}
        </button>
      </div>
      <p className={styles.changedLead} data-region="changed-lead">
        {lead}
      </p>
      {example ? (
        <p className={styles.changedExample} data-region="changed-example">
          <span className={styles.exampleKey}>{LAYOUT.example}</span>
          {copy.rangeComparisonSentence(example, from, to)}
        </p>
      ) : null}
      <p className={styles.changedSource}>{STRINGS.comparisonSource}</p>
      {to !== DEFAULT_RULE ? (
        <p className={styles.changedActions}>
          <button type="button" className={styles.linkButton} onClick={onBack}>
            {LAYOUT.backToMainRule}
          </button>
        </p>
      ) : null}
    </section>
  );
}
