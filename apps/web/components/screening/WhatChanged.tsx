"use client";

import { useEffect, useRef } from "react";

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
 * A comparison that failed to load says so and offers Retry: it never reads as the study having recorded none.
 */
export function WhatChanged({
  copy,
  from,
  to,
  schools,
  failed,
  retrying,
  onRetry,
  onHide,
  onBack,
}: {
  copy: BoundCopy;
  from: CopyRuleId;
  to: CopyRuleId;
  schools: readonly ListedSchool[];
  failed: boolean;
  /** The failed comparison is being asked for again. */
  retrying: boolean;
  onRetry: () => void;
  onHide: () => void;
  onBack: () => void;
}) {
  const { LAYOUT, STRINGS } = copy;
  const hide = useRef<HTMLButtonElement>(null);
  const retried = useRef(false);
  // Retry goes once the comparison is in, so focus moves to Hide, the control that stays.
  useEffect(() => {
    if (failed || !retried.current) return;
    retried.current = false;
    if (document.activeElement === document.body) hide.current?.focus({ preventScroll: true });
  }, [failed]);

  const pair = isUrgencyPair(from, to);
  const lead = failed ? null : pair ? copy.urgencyReassurance() : copy.comparisonSentence(from, to);
  const example = !failed && pair ? exampleSchool(schools, from, to) : null;
  return (
    <section className={styles.changed} data-region="what-changed" aria-label={LAYOUT.whatChanged}>
      <div className={styles.changedTop}>
        <span className={`${styles.eyebrow} ${styles.eyebrowNavy}`}>{LAYOUT.whatChanged}</span>
        <button ref={hide} type="button" className={styles.linkButton} onClick={onHide}>
          {LAYOUT.hideComparison}
        </button>
      </div>
      {failed ? (
        <p className={styles.changedLead} role="alert" data-region="changed-failed">
          {LAYOUT.loadFailed}{" "}
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => {
              retried.current = true;
              onRetry();
            }}
          >
            {retrying ? LAYOUT.retrying : LAYOUT.retry}
          </button>
        </p>
      ) : (
        <p className={styles.changedLead} data-region="changed-lead">
          {lead}
        </p>
      )}
      {example ? (
        <p className={styles.changedExample} data-region="changed-example">
          <span className={styles.exampleKey}>{LAYOUT.example}</span>
          {copy.rangeComparisonSentence(example, from, to)}
        </p>
      ) : null}
      {failed ? null : <p className={styles.changedSource}>{STRINGS.comparisonSource}</p>}
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
