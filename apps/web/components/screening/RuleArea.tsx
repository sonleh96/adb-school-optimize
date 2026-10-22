"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { type MouseEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { BoundCopy, CopyRuleId } from "@/lib/screening/copy";
import { PRIMARY_RULE } from "@/lib/screening/rule-pair";

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

/**
 * Focus the control that names the rule on screen: its button in the switch, Other rules when it is another rule, or
 * the rule area's Change when the area is closed. Hide, the ways back, a choice in Other rules and See what changes
 * each remove themselves on use, so they hand focus here and a keyboard user is never dropped on the page. Runs after
 * the change has rendered.
 */
export function focusRuleControl(within: HTMLElement | null) {
  requestAnimationFrame(() => {
    const target =
      within?.querySelector<HTMLElement>("[data-region=rule-switch] [aria-pressed=true]") ??
      within?.querySelector<HTMLElement>("[aria-controls=screening-other-rules]") ??
      within?.querySelector<HTMLElement>("[data-region=rule-change]");
    target?.focus({ preventScroll: true });
  });
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
  /** The switch, Other rules and the statement show; closed, the area is one plain line and its two ways on. */
  open: boolean;
  disabled: boolean;
  layer: HTMLElement | null;
  onRule: (rule: CopyRuleId) => void;
  onToggle: () => void;
  /** Opens What changed on the main rule, compared with the rule that puts the urgency rating back. */
  onSeeWithUrgency: () => void;
  onBack: () => void;
}

/**
 * The rule area. A first-time reader sees one plain line saying how the list is ordered, Change, and the question most
 * people ask of the rule, what the urgency value changes, as a link. Change opens the switch of the main rule and the
 * urgency sensitivity, Other rules and the full statement. The analyst letters stay in the method details.
 */
export function RuleArea(props: RuleAreaProps) {
  const {
    copy,
    rules,
    requested,
    shown,
    statement,
    comparing,
    open,
    disabled,
    layer,
    onRule,
    onToggle,
    onSeeWithUrgency,
    onBack,
  } = props;
  const main = rules.filter((r) => r.inPair);
  const other = rules.filter((r) => !r.inPair);
  const otherActive = other.some((r) => r.id === requested);
  // While the rule just pressed loads, the rows on screen are the previous rule's, and so would be the statement or
  // the rule line beside the new button. Neither shows until the rows are the pressed rule's.
  const line = shown === requested ? shown : null;
  // The plain line describes the rows on screen.
  const listed = shown ?? requested;
  const section = useRef<HTMLElement>(null);
  const { LAYOUT, TERMS } = copy;
  const seeWithUrgency = (
    <button
      type="button"
      className={styles.arrowLink}
      data-region="see-with-urgency"
      onClick={() => {
        onSeeWithUrgency();
        focusRuleControl(section.current);
      }}
    >
      {LAYOUT.seeWithUrgency}
      <ChevronRight size={11} aria-hidden />
    </button>
  );
  const back = (
    <button
      type="button"
      className={styles.arrowLink}
      onClick={() => {
        onBack();
        focusRuleControl(section.current);
      }}
    >
      {LAYOUT.backToMainRule}
      <ChevronRight size={11} aria-hidden />
    </button>
  );

  return (
    <section
      ref={section}
      className={styles.rule}
      data-region="rule-identity"
      data-open={open || undefined}
      aria-label={TERMS.rule.label}
    >
      <div>
        <p className={styles.ruleNowText} data-region="rule-now">
          {LAYOUT.ruleNow(listed)}
        </p>
        {/* Under the line, not beside it: the control's words say what it changes, and the one link sits after it. */}
        <div className={styles.ruleNowRow}>
          <button
            type="button"
            className={styles.ruleChange}
            data-region="rule-change"
            aria-expanded={open}
            aria-controls="screening-rule-choices"
            disabled={disabled}
            onClick={onToggle}
          >
            {open ? LAYOUT.changeDone : LAYOUT.orderControl}
          </button>
          {open || comparing || !line ? null : line === PRIMARY_RULE ? seeWithUrgency : back}
        </div>
      </div>
      {open ? (
        <div id="screening-rule-choices" className={styles.ruleChoices}>
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
                data-rule={r.id}
                disabled={disabled}
                onClick={() => onRule(r.id)}
              >
                <span className={styles.ruleButtonLabel}>{copy.ruleLabel(r.id)}</span>
              </button>
            ))}
          </div>
          {line === PRIMARY_RULE && statement ? (
            <p className={styles.statement} data-region="list-statement">
              {statement} {seeWithUrgency}
            </p>
          ) : null}
          {line && line !== PRIMARY_RULE ? (
            <p className={styles.ruleLine} data-region="rule-role">
              {main.some((r) => r.id === line) ? null : <b>{copy.ruleLabel(line)}. </b>}
              {copy.ruleOneLine(line)} <span className={styles.ruleRole}>{copy.ruleRoleLine(line)}.</span>
              {comparing ? null : <> {back}</>}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

const POP = { width: 320, gap: 6, edge: 16, roomBelow: 200 };

/**
 * Where Other rules opens: under its button, as wide as the window allows, and moved left as far as it must to keep
 * its right edge 16 px inside the window (the narrow layout puts the button at the right). It opens upward only when
 * the room below is short and there is more above; what does not fit scrolls inside it. It grows from the button.
 */
function popoverPlace(button: DOMRect, host: DOMRect): React.CSSProperties {
  const width = Math.min(POP.width, host.width - 2 * POP.edge);
  const left = Math.max(POP.edge, Math.min(button.left - host.left, host.width - POP.edge - width));
  const below = host.bottom - button.bottom - POP.gap - POP.edge;
  const above = button.top - host.top - POP.gap - POP.edge;
  const down = below >= POP.roomBelow || below >= above;
  const originX = `${Math.round(button.left + button.width / 2 - host.left - left)}px`;
  return down
    ? {
        top: button.bottom - host.top + POP.gap,
        left,
        width,
        maxHeight: below,
        transformOrigin: `${originX} top`,
      }
    : {
        bottom: host.bottom - button.top + POP.gap,
        left,
        width,
        maxHeight: above,
        transformOrigin: `${originX} bottom`,
      };
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
 * "Other rules (5)" and its popover: the other rules first, then the main rule and the urgency sensitivity, each with
 * its one line and role.
 * Choosing any rule closes it. Escape closes it and hands focus back to the button. Opened from the keyboard, it
 * appears at once; opened by pointer, it grows from its button.
 */
function OtherRules({ copy, main, other, requested, active, disabled, layer, onRule }: OtherRulesProps) {
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<{ keyboard: boolean } | null>(null);
  const [at, setAt] = useState<React.CSSProperties | null>(null);
  const { LAYOUT, TERMS } = copy;

  useLayoutEffect(() => {
    if (!open || !button.current || !layer) return;
    setAt(popoverPlace(button.current.getBoundingClientRect(), layer.getBoundingClientRect()));
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
  // The chosen item goes with the popover, so focus goes back to the button that opened it.
  const choose = (id: CopyRuleId) => {
    close();
    onRule(id);
    button.current?.focus({ preventScroll: true });
  };
  const item = (r: RuleChoice) => (
    <li key={r.id}>
      <button
        type="button"
        className={styles.popRule}
        aria-pressed={r.id === requested}
        onClick={() => choose(r.id)}
      >
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
