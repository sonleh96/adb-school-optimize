"use client";

/**
 * Help mode, the lighter second layer of guidance: "Explain this screen" (or `?`) marks about 25 key concepts; a
 * marked element explains itself instead of acting, by pointer or with Enter; the card opens beside the panel that
 * holds its subject, with an example from this data. Escape closes the card, then leaves help mode.
 *
 * Marks are attributes on the workspace's own elements (`data-xp`, and `tabindex` and `role="button"` on those that
 * cannot take focus), set from the hooks it exposes and removed when help mode ends. Nothing here acts on the
 * workspace except "Show on map", which selects the school through the controller.
 */
import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { CopySchool } from "@/lib/screening/copy";
import { PRIMARY_RULE } from "@/lib/screening/rule-pair";
import { type CardModel, cardModel } from "@/lib/screening/guide/cards";
import { type CardId, isCardId } from "@/lib/screening/guide/machine";
import { type MarkContext, marksIn } from "@/lib/screening/guide/marks";
import { placeCard } from "@/lib/screening/guide/placement";
import type { Roles } from "@/lib/screening/guide/roles";

import { Sentence } from "../Sentence";
import { useWorkspace, useWorkspaceState } from "../WorkspaceProvider";
import { reducedMotion } from "../guide/dom";
import { useKeyboardRef, useLayerStore, useLayers } from "../guide/GuidanceProvider";
import type { GuideData } from "../guide/types";
import { useLater } from "../guide/useLater";
import { useReturnFocus } from "../guide/useReturnFocus";
import styles from "./help.module.css";

const ATTRS = ["data-xp", "data-xp-block", "data-xp-active"] as const;

function clearMarks(root: HTMLElement) {
  for (const element of root.querySelectorAll("[data-xp], [data-xp-tab]")) {
    for (const name of ATTRS) element.removeAttribute(name);
    if (element.hasAttribute("data-xp-tab")) {
      element.removeAttribute("data-xp-tab");
      element.removeAttribute("tabindex");
      element.removeAttribute("role");
    }
  }
}

/** A mark that takes focus itself, or sits inside a control that does (a row): it gets no tab stop of its own. */
const focusable = (element: Element) =>
  !!element.closest("button, a[href], input, select, textarea") ||
  (Number(element.getAttribute("tabindex")) >= 0 &&
    element.hasAttribute("tabindex") &&
    !element.hasAttribute("data-xp-tab"));

export default function HelpLayer({
  root,
  data,
  roles,
}: {
  root: HTMLElement | null;
  data: GuideData;
  roles: Roles | null;
}) {
  const store = useLayerStore();
  const { state } = useLayers();
  const ws = useWorkspace();
  const wsState = useWorkspaceState();
  const later = useLater(data.copy);
  const keyboard = useKeyboardRef();
  const [count, setCount] = useState(0);
  const [said, setSaid] = useState("");
  const rule = data.shown?.rule ?? PRIMARY_RULE;
  const markCtx = useMemo((): MarkContext => ({ rule, school: wsState.school }), [rule, wsState.school]);

  // Marks follow the screen: every change to the workspace's markup re-marks it on the next frame.
  useEffect(() => {
    if (!root) return;
    let frame = 0;
    const mark = () => {
      frame = 0;
      const marks = marksIn(root, markCtx);
      const keep = new Set(marks.map((m) => m.element));
      for (const element of root.querySelectorAll("[data-xp]"))
        if (!keep.has(element)) {
          for (const name of ATTRS) element.removeAttribute(name);
          if (element.hasAttribute("data-xp-tab")) {
            element.removeAttribute("data-xp-tab");
            element.removeAttribute("tabindex");
            element.removeAttribute("role");
          }
        }
      for (const { element, card, block } of marks) {
        if (element.getAttribute("data-xp") !== card) element.setAttribute("data-xp", card);
        element.toggleAttribute("data-xp-block", block);
        const help = store.snapshot().state.help;
        if (help && !focusable(element) && !element.hasAttribute("data-xp-tab")) {
          element.setAttribute("data-xp-tab", "");
          element.setAttribute("tabindex", "0");
          element.setAttribute("role", "button");
        }
      }
      const active = store.snapshot().state.card;
      for (const element of root.querySelectorAll("[data-xp-active]"))
        if (element.getAttribute("data-xp") !== active) element.removeAttribute("data-xp-active");
      if (active) root.querySelector(`[data-xp="${CSS.escape(active)}"]`)?.setAttribute("data-xp-active", "");
      setCount(marks.length);
    };
    const soon = () => {
      if (!frame) frame = requestAnimationFrame(mark);
    };
    mark();
    const observer = new MutationObserver(soon);
    observer.observe(root, { childList: true, subtree: true });
    const stop = store.subscribe(soon);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      stop();
      clearMarks(root);
    };
  }, [root, markCtx, store, state.help]);

  // Help mode on the workspace root: the marks show, the map's cursor asks for help.
  useEffect(() => {
    if (!root) return;
    root.classList.add(styles.marksOn);
    root.classList.toggle(styles.helpOn, state.help);
    return () => root.classList.remove(styles.marksOn, styles.helpOn);
  }, [root, state.help]);

  // Announce entering and leaving.
  const announced = useRef<boolean | null>(null);
  useEffect(() => {
    if (announced.current === state.help || (state.help && count === 0)) return;
    if (announced.current === null && !state.help) return;
    announced.current = state.help;
    setSaid(state.help ? data.copy.HELP.liveOn(count) : data.copy.HELP.liveOff);
  }, [state.help, count, data.copy]);

  // A marked element explains itself instead of acting: by pointer, or Enter or Space on a focused mark.
  useEffect(() => {
    if (!root || !state.help) return;
    const open = (event: Event, element: Element) => {
      event.preventDefault();
      event.stopPropagation();
      const id = element.getAttribute("data-xp");
      if (!isCardId(id)) return;
      store.dispatch({ type: "card", id: store.snapshot().state.card === id ? null : id });
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target || target.closest("[data-guidance]")) return;
      const mark = target.closest("[data-xp]");
      if (mark && root.contains(mark)) open(event, mark);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target as Element | null;
      if (!target || target.closest("[data-guidance]")) return;
      if (target.hasAttribute("data-xp-tab") || (target.hasAttribute("data-xp") && event.key === "Enter"))
        return open(event, target);
      // A row whose place is marked explains the mark on Enter, as a click on the mark does.
      const inner = target.matches("button") ? target.querySelectorAll("[data-xp]") : [];
      if (inner.length === 1 && event.key === "Enter") open(event, inner[0]);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [root, state.help, store]);

  // A click anywhere else closes the card.
  useEffect(() => {
    if (!state.card) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest("[data-help-card]") || target?.closest("[data-xp]")) return;
      store.dispatch({ type: "card", id: null });
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [state.card, store]);

  const schools = data.shown?.schools ?? [];
  const groups = later.status === "ready" ? later.copy.GLOSSARY_GROUPS : [];
  const model =
    state.card && roles && data.shown
      ? cardModel(
          { copy: data.shown.copy, roles, rule: data.shown.rule, schools, open: wsState.school, groups },
          state.card
        )
      : null;

  // A card a pasted link names that the data does not hold (a school that is not in it) is dropped once the data
  // is in, so the address stops naming it and the first Escape leaves help mode as it should.
  const unknown = !!state.card && !!roles && !!data.shown && data.ready && later.status === "ready" && !model;
  useEffect(() => {
    if (unknown) store.dispatch({ type: "card", id: null });
  }, [unknown, store]);

  return (
    <>
      <p className={styles.live} aria-live="polite">
        {said}
      </p>
      {state.help && !state.card ? <HelpBar data={data} root={root} /> : null}
      {model && state.card ? (
        <HelpCard
          key={state.card}
          id={state.card}
          model={model}
          root={root}
          data={data}
          instant={keyboard.current}
          onShow={(school) => ws.setState({ school })}
          schools={schools}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ the bar */

function HelpBar({ data, root }: { data: GuideData; root: HTMLElement | null }) {
  const store = useLayerStore();
  const { HELP } = data.copy;
  const bar = useRef<HTMLDivElement>(null);
  // The bar sits just above the key, wherever the key's height puts its top. With the key out of sight (the narrow
  // layout showing its list alone) the stylesheet puts it at the window's foot.
  useLayoutEffect(() => {
    const element = bar.current;
    if (!element || !root) return;
    const place = () => {
      const legend = root.querySelector('[data-region="legend"]');
      const key = legend?.getBoundingClientRect();
      const seen = !!legend && getComputedStyle(legend).visibility !== "hidden";
      element.style.bottom =
        seen && key && key.height ? `${Math.round(window.innerHeight - key.top + 10)}px` : "";
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(root);
    const legend = root.querySelector('[data-region="legend"]');
    if (legend) observer.observe(legend);
    // Choosing List or Map, or a guide step taking the band, moves the key without resizing anything.
    const shown = new MutationObserver(place);
    shown.observe(root, { attributes: true, attributeFilter: ["data-pane", "data-rail-band"] });
    return () => {
      observer.disconnect();
      shown.disconnect();
    };
  }, [root]);
  return (
    <div ref={bar} className={styles.bar} data-guidance="" data-testid="help-bar">
      <div className={styles.barIn}>
        <span className={styles.keyCap} aria-hidden="true">
          ?
        </span>
        <span>{HELP.bar}</span>
        <button
          type="button"
          className={styles.barButton}
          onClick={() => store.dispatch({ type: "gloss", open: true })}
        >
          {HELP.glossary}
        </button>
        <button
          type="button"
          className={styles.barButton}
          onClick={() => store.dispatch({ type: "help", on: false })}
        >
          {HELP.done}
          <kbd>{HELP.esc}</kbd>
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the card */

const BARS = '[data-region="mapbar"], [data-region="legend"], [data-region="actions"]';
const HOSTS = `[data-slot="column"], [data-slot="school-card"], ${BARS}`;

function HelpCard({
  id,
  model,
  root,
  data,
  instant,
  onShow,
  schools,
}: {
  id: CardId;
  model: CardModel;
  root: HTMLElement | null;
  data: GuideData;
  instant: boolean;
  onShow: (school: string) => void;
  schools: readonly CopySchool[];
}) {
  const store = useLayerStore();
  const wsState = useWorkspaceState();
  const card = useRef<HTMLElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const [more, setMore] = useState(false);
  const { HELP } = data.copy;
  useReturnFocus();

  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, []);

  // Beside the panel that holds the subject; a bottom sheet in the narrow layout.
  useLayoutEffect(() => {
    const element = card.current;
    if (!element || !root) return;
    const place = () => {
      if (data.mode === "narrow") {
        element.removeAttribute("style");
        return;
      }
      const anchor =
        root.querySelector(`[data-xp="${CSS.escape(id)}"]`) ??
        (id.startsWith("place:")
          ? root.querySelector(`[data-school-key="${CSS.escape(id.slice(6))}"]`)
          : null) ??
        // Help, the way into help mode: the one the layout shows.
        [...root.querySelectorAll('[data-region="help-button"]')].find(
          (button) => button.getClientRects().length
        );
      if (!anchor) return;
      const host = anchor.closest(HOSTS);
      const a = anchor.getBoundingClientRect();
      const placed = placeCard(
        a,
        host ? host.getBoundingClientRect() : null,
        { width: element.offsetWidth, height: element.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
        !!host?.matches(BARS)
      );
      element.style.left = `${placed.x}px`;
      element.style.top = `${placed.y}px`;
      element.style.transformOrigin = placed.origin;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(root);
    observer.observe(element);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", place, true);
    };
  }, [id, root, data.mode, model]);

  const exampleSchool = model.school ?? model.examples.find((e) => e.school)?.school ?? null;
  const canShow =
    exampleSchool && wsState.school !== exampleSchool && schools.some((s) => s.id === exampleSchool);
  return (
    <section
      ref={card}
      className={styles.card}
      role="dialog"
      aria-labelledby="help-card-title"
      data-help-card=""
      data-guidance=""
      data-card={id}
      data-instant={instant || reducedMotion() || undefined}
      data-sheet={data.mode === "narrow" || undefined}
    >
      <div className={styles.cardTop}>
        <span className={styles.eyebrow}>{model.eyebrow}</span>
        <button
          type="button"
          className={styles.close}
          aria-label={HELP.close}
          title={HELP.close}
          onClick={() => store.dispatch({ type: "card", id: null })}
        >
          <X size={13} aria-hidden />
        </button>
      </div>
      <h2 ref={title} id="help-card-title" className={styles.title} tabIndex={-1}>
        {model.title}
      </h2>
      {model.chips?.length ? (
        <ul className={styles.chips}>
          {model.chips.map((chip) => (
            <li key={chip}>{chip}</li>
          ))}
        </ul>
      ) : null}
      <p className={styles.line}>{model.line}</p>
      {model.body ? <p className={styles.body}>{model.body}</p> : null}
      {model.receipt ? (
        <div className={styles.receipt}>
          <span className={styles.rule}>{HELP.adds}</span>
          {model.receipt.rows.map((row) => (
            <div key={row.label}>
              <span>{row.label}</span>
              <b>{row.value.toFixed(3)}</b>
            </div>
          ))}
          <div className={styles.rest}>
            <span>{HELP.others}</span>
            <b>{model.receipt.rest.toFixed(3)}</b>
          </div>
          <div className={styles.total}>
            <span>{data.copy.TERMS.score.label}</span>
            <b>{model.receipt.total.toFixed(3)}</b>
          </div>
        </div>
      ) : null}
      {model.examples.length ? (
        <div className={styles.examples}>
          <span className={styles.rule}>{HELP.inData}</span>
          {model.examples.map((example, i) => {
            // A name shows once above the examples about that school.
            const before = model.examples.slice(0, i).findLast((e) => e.who)?.who;
            const who = example.who && example.who !== before ? example.who : null;
            return (
              <p key={i} className={styles.example}>
                {who ? <span className={styles.who}>{who}</span> : null}
                {example.label ? <span className={styles.exampleLabel}>{example.label}</span> : null}
                <span data-example="">
                  <Sentence segments={example.text} />
                </span>
              </p>
            );
          })}
        </div>
      ) : null}
      {model.note ? (
        <p className={styles.note}>
          <span className={styles.rule}>{HELP.keep}</span>
          {model.note}
        </p>
      ) : null}
      {model.help && more ? <p className={styles.more}>{model.help}</p> : null}
      <div className={styles.foot}>
        {model.help ? (
          <button
            type="button"
            className={styles.link}
            aria-expanded={more}
            onClick={() => setMore((v) => !v)}
          >
            {more ? HELP.readLess : HELP.readMore}
          </button>
        ) : null}
        {canShow ? (
          <button type="button" className={styles.link} onClick={() => onShow(exampleSchool!)}>
            {HELP.showOnMap}
          </button>
        ) : null}
        <span className={styles.spacer} />
        <button
          type="button"
          className={`${styles.link} ${styles.quietLink}`}
          onClick={() => store.dispatch({ type: "gloss", open: true, q: "", x: model.gloss })}
        >
          {HELP.inGlossary}
        </button>
      </div>
    </section>
  );
}
