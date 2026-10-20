"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { type MouseEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { type BoundCopy, type CopyRuleId, DEFAULT_RULE } from "@/lib/screening/copy";

import type { RuleChoice } from "./useScreeningData";
import styles from "./screening.module.css";

/** The analyst letter of a rule, set as the paper sets it: "S0" with the 0 lowered. Always beside the rule's words. */
export function RuleSymbol({ symbol, className }: { symbol: string; className?: string }) {
  const lowered = symbol.endsWith("0");
  return (
    <span className={`${styles.sym} ${className ?? ""}`} aria-hidden="true">
      {lowered ? symbol.slice(0, -1) : symbol}
      {lowered ? <sub>0</sub> : null}
    </span>
  );
}

interface RuleAreaProps {
  copy: BoundCopy;
  rules: readonly RuleChoice[];
  /** The rule asked for. The switch shows it at once, even while its list loads. */
  requested: CopyRuleId;
  /** The rule of the rows on screen. The statement and the rule line speak for it. */
  shown: CopyRuleId | null;
  /** The statement under the main rule, or null while What changed shows or the statement's data is not in. */
  statement: string | null;
  /** What changed is showing, and carries its own way back. */
  comparing: boolean;
  disabled: boolean;
  layer: HTMLElement | null;
  onRule: (rule: CopyRuleId) => void;
  onSeeWithout: () => void;
  onBack: () => void;
}

export function RuleArea(props: RuleAreaProps) {
  const {
    copy,
    rules,
    requested,
    shown,
    statement,
    comparing,
    disabled,
    layer,
    onRule,
    onSeeWithout,
    onBack,
  } = props;
  const main = rules.filter((r) => r.primary);
  const other = rules.filter((r) => !r.primary);
  const otherActive = other.some((r) => r.id === requested);
  // While the rule just pressed loads, the rows on screen are the previous rule's, and so would be the statement or
  // the rule line beside the new button. Neither shows until the rows are the pressed rule's.
  const line = shown === requested ? shown : null;
  const { LAYOUT, TERMS } = copy;

  return (
    <section className={styles.rule} data-region="rule-identity" aria-label={TERMS.rule.label}>
      <div className={styles.ruleTop}>
        <span className={styles.eyebrow}>{TERMS.rule.label}</span>
        {other.length > 0 ? (
          <OtherRules
            copy={copy}
            main={main}
            other={other}
            requested={requested}
            active={otherActive}
            disabled={disabled}
            layer={layer}
            onRule={onRule}
          />
        ) : null}
      </div>
      <div className={styles.ruleSeg} role="group" aria-label={LAYOUT.rulePair} data-region="rule-switch">
        {main.map((r) => (
          <button
            key={r.id}
            type="button"
            className={styles.ruleButton}
            aria-pressed={r.id === requested}
            disabled={disabled}
            onClick={() => onRule(r.id)}
          >
            <RuleSymbol symbol={copy.ruleSymbol(r.id)} />
            <span className={styles.ruleButtonLabel}>{copy.ruleLabel(r.id)}</span>
          </button>
        ))}
      </div>
      {line === DEFAULT_RULE && statement ? (
        <p className={styles.statement} data-region="list-statement">
          {statement}{" "}
          <button type="button" className={styles.arrowLink} onClick={onSeeWithout}>
            {LAYOUT.seeWithout}
            <ChevronRight size={11} aria-hidden />
          </button>
        </p>
      ) : null}
      {line && line !== DEFAULT_RULE ? (
        <p className={styles.ruleLine} data-region="rule-role">
          {main.some((r) => r.id === line) ? null : (
            <>
              <RuleSymbol symbol={copy.ruleSymbol(line)} className={styles.symInline} />
              <b>{copy.ruleLabel(line)}.</b>{" "}
            </>
          )}
          {copy.ruleOneLine(line)} <span className={styles.ruleRole}>{copy.ruleRoleLine(line)}.</span>
          {comparing ? null : (
            <>
              {" "}
              <button type="button" className={styles.arrowLink} onClick={onBack}>
                {LAYOUT.backToMainRule}
                <ChevronRight size={11} aria-hidden />
              </button>
            </>
          )}
        </p>
      ) : null}
    </section>
  );
}

interface OtherRulesProps {
  copy: BoundCopy;
  main: readonly RuleChoice[];
  other: readonly RuleChoice[];
  requested: CopyRuleId;
  active: boolean;
  disabled: boolean;
  layer: HTMLElement | null;
  onRule: (rule: CopyRuleId) => void;
}

/**
 * "Other rules (5)" and its popover: the other rules first, then the two main ones, each with its one line and role.
 * Choosing any rule closes it. Escape closes it and hands focus back to the button. Opened from the keyboard, it
 * appears at once; opened by pointer, it grows from its button.
 */
function OtherRules({ copy, main, other, requested, active, disabled, layer, onRule }: OtherRulesProps) {
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<{ keyboard: boolean } | null>(null);
  const [at, setAt] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const { LAYOUT, TERMS } = copy;

  useLayoutEffect(() => {
    if (!open || !button.current || !layer) return;
    const b = button.current.getBoundingClientRect();
    const host = layer.getBoundingClientRect();
    const top = b.bottom - host.top + 6;
    setAt({ top, left: b.left - host.left, maxHeight: host.height - top - 16 });
  }, [open, layer]);

  // Focus moves in once the popover is placed (it is hidden while it is measured, and a hidden element takes no focus).
  const placed = at !== null;
  useEffect(() => {
    if (!open || !placed) return;
    const items = [...(panel.current?.querySelectorAll<HTMLElement>("button") ?? [])];
    (items.find((item) => item.getAttribute("aria-pressed") === "true") ?? items[0])?.focus({
      preventScroll: true,
    });
  }, [open, placed]);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(null);
    };
    // Escape closes the innermost layer first: the popover, before the card behind it.
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(null);
      button.current?.focus({ preventScroll: true });
    };
    const resize = () => setOpen(null);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", resize);
    };
  }, [open]);

  const close = () => setOpen(null);
  const choose = (id: CopyRuleId) => {
    close();
    onRule(id);
  };
  const item = (r: RuleChoice) => (
    <li key={r.id}>
      <button
        type="button"
        className={styles.popRule}
        aria-pressed={r.id === requested}
        onClick={() => choose(r.id)}
      >
        <RuleSymbol symbol={copy.ruleSymbol(r.id)} />
        <span className={styles.popRuleText}>
          <span className={styles.popRuleLabel}>{copy.ruleLabel(r.id)}</span>
          <span className={styles.popRuleLine}>{copy.ruleOneLine(r.id)}</span>
          <span className={styles.popRuleRole}>{copy.ruleRoleLine(r.id)}</span>
        </span>
      </button>
    </li>
  );

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`${styles.otherRules} ${active ? styles.otherRulesActive : ""}`}
        aria-expanded={open !== null}
        aria-controls="screening-other-rules"
        disabled={disabled}
        onClick={(event: MouseEvent) => (open ? close() : setOpen({ keyboard: event.detail === 0 }))}
      >
        {LAYOUT.otherRulesCount(other.length)}
        <ChevronDown size={12} aria-hidden />
      </button>
      {open && layer
        ? createPortal(
            <div
              ref={panel}
              id="screening-other-rules"
              className={styles.pop}
              data-instant={open.keyboard || undefined}
              style={at ?? { visibility: "hidden" }}
              role="group"
              aria-label={LAYOUT.otherRulesCount(other.length)}
            >
              <div className={styles.popScroll}>
                <p className={styles.eyebrow}>{LAYOUT.otherRulesCount(other.length)}</p>
                <ul className={styles.popList}>{other.map(item)}</ul>
                <p className={styles.eyebrow}>{LAYOUT.rulePair}</p>
                <ul className={styles.popList}>{main.map(item)}</ul>
                <p className={styles.popNote}>{TERMS.rule.help}</p>
              </div>
            </div>,
            layer
          )
        : null}
    </>
  );
}
