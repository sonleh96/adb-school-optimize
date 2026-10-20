"use client";

import { ArrowLeftRight } from "lucide-react";
import { useState } from "react";

import type { BoundCopy, CopyRuleId } from "@/lib/screening/copy";
import type { Method } from "@/lib/screening/copy/method";
import type { Rule } from "@/lib/screening/types";

import { RuleSymbol } from "../RuleArea";
import type { RuleChoice } from "../useScreeningData";
import base from "../screening.module.css";
import styles from "./method.module.css";

/**
 * The rule as the method details show it: its letter, label and role, its formula on demand, the two main rules as
 * tiles and the other five by name, and the way into compare mode. The plain switch and statement step aside.
 */
export function MethodRuleArea({
  copy,
  method,
  rules,
  detail,
  requested,
  formula,
  disabled,
  onRule,
  onFormula,
  onCompare,
}: {
  copy: BoundCopy;
  method: Method;
  rules: readonly RuleChoice[];
  /** The API's rules, for each one's formula. */
  detail: readonly Rule[] | null;
  requested: CopyRuleId;
  formula: boolean;
  disabled: boolean;
  onRule: (rule: CopyRuleId) => void;
  onFormula: () => void;
  onCompare: () => void;
}) {
  const main = rules.filter((r) => r.primary);
  const other = rules.filter((r) => !r.primary);
  const [othersOpen, setOthersOpen] = useState(false);
  const showOthers = othersOpen || other.some((r) => r.id === requested);
  const { TERMS, LAYOUT } = copy;
  const text = detail?.find((r) => r.rule_id === requested)?.formula ?? null;
  const isMain = main.some((r) => r.id === requested);

  return (
    <section className={`${base.rule} ${styles.rule}`} aria-label={TERMS.rule.label}>
      <div className={styles.ruleTop}>
        <span className={base.eyebrow}>{TERMS.rule.label}</span>
        <span className={styles.ruleActs}>
          {text ? (
            <button
              type="button"
              className={base.linkButton}
              aria-expanded={formula}
              aria-controls="screening-formula"
              onClick={onFormula}
            >
              {formula ? method.rule.hideFormula : method.rule.formula}
            </button>
          ) : null}
          <button
            type="button"
            className={styles.compareToggle}
            data-region="compare-toggle"
            aria-pressed={false}
            disabled={disabled}
            onClick={onCompare}
          >
            <ArrowLeftRight size={13} aria-hidden />
            {TERMS.compare.label}
          </button>
        </span>
      </div>
      <div className={styles.ruleHead} data-region="rule-identity">
        <RuleSymbol symbol={copy.ruleSymbol(requested)} className={styles.ruleSym} />
        <div className={styles.ruleWords}>
          <h2 className={styles.ruleLabel}>{copy.ruleLabel(requested)}</h2>
          <p className={styles.ruleRole}>
            <b data-region="rule-role">{copy.ruleRoleLine(requested)}</b>
            <span>
              {copy.ruleOneLine(requested)}
              {isMain ? null : ` ${copy.urgencyNote(requested)}`}
            </span>
          </p>
        </div>
      </div>
      {formula && text ? (
        <p className={styles.formula} id="screening-formula">
          {text}
        </p>
      ) : null}
      <div data-region="rule-switch">
        <div className={styles.tiles} role="group" aria-label={method.rule.primaryAria}>
          {main.map((r) => (
            <button
              key={r.id}
              type="button"
              className={styles.tile}
              aria-pressed={r.id === requested}
              disabled={disabled}
              onClick={() => onRule(r.id)}
            >
              <RuleSymbol symbol={copy.ruleSymbol(r.id)} className={styles.tileSym} />
              <span className={styles.tileWords}>
                <span className={styles.tileName}>{copy.ruleShortName(r.id)}</span>
                <span className={styles.tileSource}>{copy.ruleSource(r.id)}</span>
              </span>
            </button>
          ))}
        </div>
        {other.length > 0 ? (
          <div className={styles.others} role="group" aria-label={LAYOUT.otherRules}>
            <button
              type="button"
              className={base.linkButton}
              aria-expanded={showOthers}
              aria-controls="screening-other-rule-names"
              onClick={() => setOthersOpen((open) => !open)}
            >
              {LAYOUT.otherRulesCount(other.length)}
            </button>
            {showOthers ? (
              <span className={styles.otherNames} id="screening-other-rule-names">
                {other.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={styles.otherName}
                    aria-pressed={r.id === requested}
                    title={`${copy.ruleLabel(r.id)}. ${copy.ruleRoleLine(r.id)}`}
                    disabled={disabled}
                    onClick={() => onRule(r.id)}
                  >
                    {copy.ruleShortName(r.id)}
                  </button>
                ))}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
