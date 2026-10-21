"use client";

import { useState } from "react";

import type { Rule, RuleId } from "@/lib/screening/types";

import { COPY } from "./copy";
import styles from "./screening.module.css";

/** The two primary rules sit side by side; the rest wait behind "Other rules". */
export function splitRules(rules: readonly Rule[]): { main: Rule[]; other: Rule[] } {
  return {
    main: rules.filter((rule) => rule.policy_role === "primary"),
    other: rules.filter((rule) => rule.policy_role !== "primary"),
  };
}

export function RuleSwitch({
  rules,
  active,
  onChange,
}: {
  rules: readonly Rule[];
  active: RuleId;
  onChange: (rule: RuleId) => void;
}) {
  const [open, setOpen] = useState(false);
  const { main, other } = splitRules(rules);
  const otherActive = other.some((rule) => rule.rule_id === active);

  return (
    <div
      className={styles.rule}
      data-slot="rule-switch"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <div className={styles.ruleTop}>
        <span className={styles.eyebrow}>{COPY.ruleEyebrow}</span>
        {other.length > 0 ? (
          <button
            type="button"
            className={styles.linkButton}
            aria-expanded={open}
            aria-controls="screening-other-rules"
            style={otherActive ? { fontWeight: 700 } : undefined}
            onClick={() => setOpen((value) => !value)}
          >
            {COPY.otherRules}
          </button>
        ) : null}
      </div>
      <div className={styles.ruleSeg} role="group" aria-label={COPY.ruleEyebrow}>
        {main.map((rule) => (
          <button
            key={rule.rule_id}
            type="button"
            className={styles.ruleButton}
            aria-pressed={rule.rule_id === active}
            onClick={() => onChange(rule.rule_id)}
          >
            {rule.label}
          </button>
        ))}
      </div>
      {/* The plain statement of what the active rule does goes here once the copy system lands. */}
      {open ? (
        <ul className={styles.otherRules} id="screening-other-rules">
          {other.map((rule) => (
            <li key={rule.rule_id}>
              <button
                type="button"
                className={styles.otherRuleButton}
                aria-pressed={rule.rule_id === active}
                onClick={() => {
                  onChange(rule.rule_id);
                  setOpen(false);
                }}
              >
                <span className={styles.otherRuleName}>{rule.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
