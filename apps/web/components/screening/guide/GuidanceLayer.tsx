"use client";

/**
 * The guidance layers' mount point in the workspace. What ships with the page is small: the map bar (Guides,
 * Explain this screen, Glossary of terms), the rail's frame, the How this works link and the narrow layout's menu.
 * The rail's contents, the page, help mode and the glossary load the first time they open, with the copy they need.
 *
 * Which guides the data can teach is decided here, from the loaded data (R13), so the Guides button can say how
 * many a returning user has seen without loading the guides.
 */
import dynamic from "next/dynamic";
import { BookOpen, ListChecks, Menu as MenuIcon } from "lucide-react";
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { BoundCopy } from "@/lib/screening/copy";
import { seenCount } from "@/lib/screening/guide/machine";
import { catalogOf, planOf, rolesOf } from "@/lib/screening/guide/roles";

import { reducedMotion } from "./dom";
import { useGuidanceFrame, useKeyboardRef, useLayerStore, useLayers } from "./GuidanceProvider";
import type { GuideData } from "./types";
import { useLater } from "./useLater";
import styles from "./guide.module.css";

const Busy = () => <div aria-busy="true" />;
const Rail = dynamic(() => import("./Rail"), { ssr: false, loading: Busy });
const HowPage = dynamic(() => import("../how/HowPage"), { ssr: false, loading: Busy });
const HelpLayer = dynamic(() => import("../help/HelpLayer"), { ssr: false });
const Glossary = dynamic(() => import("../help/Glossary"), { ssr: false });

export function GuidanceLayer({ root, data }: { root: HTMLElement | null; data: GuideData }) {
  const store = useLayerStore();
  const { state } = useLayers();
  const frame = useGuidanceFrame(data.width);
  const keyboard = useKeyboardRef();

  // The export button arrives with the method details; guide 1 offers its download step once it is on screen.
  const [hasExport, setHasExport] = useState(false);
  useEffect(() => {
    if (data.ready) setHasExport(!!root?.querySelector('[data-region="export-button"]'));
  }, [root, data.ready]);
  const roles = useMemo(
    () => (data.shown ? rolesOf(data.shown.schools, data.shown.copy) : null),
    [data.shown]
  );
  const plan = useMemo(
    () => (roles ? planOf(roles, { export: hasExport, proposed: data.proposed }) : null),
    [roles, hasExport, data.proposed]
  );
  useEffect(() => {
    if (plan) store.setCatalog(catalogOf(plan));
  }, [store, plan]);

  // The panels slide to their new place when the rail opens, closes or widens; a key moves them at once, and the
  // rail a first visit opens with is in place before the first paint.
  const lastRail = useRef(frame.rail);
  const painted = useRef(false);
  useEffect(() => {
    const frameId = requestAnimationFrame(() => (painted.current = true));
    return () => cancelAnimationFrame(frameId);
  }, []);
  useLayoutEffect(() => {
    const dx = lastRail.current - frame.rail;
    lastRail.current = frame.rail;
    const stage = root?.querySelector<HTMLElement>('[data-slot="stage"]');
    if (!dx || !stage || !painted.current || keyboard.current || reducedMotion() || data.mode === "narrow")
      return;
    stage.animate([{ transform: `translateX(${dx}px)` }, { transform: "none" }], {
      duration: 240,
      easing: "cubic-bezier(0.23, 1, 0.32, 1)",
    });
  }, [frame.rail, root, keyboard, data.mode]);

  const railOpen = state.rail.kind !== "off";
  return (
    <>
      {data.mode !== "narrow" ? <MapBar root={root} data={data} /> : null}
      {railOpen ? (
        <div
          className={styles.rail}
          data-testid="guide-rail"
          data-present={(state.present && state.rail.kind === "step" && data.mode !== "narrow") || undefined}
          data-step={state.rail.kind === "step" || undefined}
        >
          <Rail root={root} data={data} roles={roles} plan={plan} />
        </div>
      ) : null}
      {state.page ? <HowPage data={data} /> : null}
      {state.help || state.card ? <HelpLayer root={root} data={data} roles={roles} /> : null}
      {state.gloss.open ? <Glossary root={root} data={data} /> : null}
    </>
  );
}

/* ------------------------------------------------------------------ the map bar */

function MapBar({ root, data }: { root: HTMLElement | null; data: GuideData }) {
  const store = useLayerStore();
  const { state, memory, catalog } = useLayers();
  const { copy } = data;
  const { LAYOUT, HELP } = copy;
  const bar = useRef<HTMLDivElement>(null);
  const seen = catalog ? seenCount(memory, catalog) : 0;

  // When the bar would touch the actions it steps down a row; when it would then touch the card, the glossary
  // button keeps only its icon. Its name stays in aria-label and title.
  const full = useRef(0);
  useLayoutEffect(() => {
    const element = bar.current;
    if (!element || !root) return;
    const check = () => {
      const tight = element.dataset.tight !== undefined;
      if (!tight) full.current = element.offsetWidth;
      const left = element.getBoundingClientRect().left;
      const right = left + full.current + 8;
      const actions = root.querySelector('[data-region="actions"]')?.getBoundingClientRect();
      const card = root.querySelector('[data-region="inspector"]')?.getBoundingClientRect();
      const stack = data.mode === "compact" || (!!actions && actions.width > 0 && right > actions.left);
      const squeeze = stack && !!card && card.width > 0 && right > card.left;
      for (const node of [element, root]) {
        node.toggleAttribute("data-bar-stack", stack);
        node.toggleAttribute("data-bar-tight", squeeze || data.mode === "compact");
      }
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(root);
    const mutations = new MutationObserver(check);
    mutations.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [root, data.mode, state.rail.kind]);

  const railOpen = state.rail.kind !== "off";
  return (
    <div
      ref={bar}
      className={styles.mapbar}
      role="toolbar"
      aria-label={LAYOUT.mapbarAria}
      data-region="mapbar"
    >
      {railOpen ? null : (
        <button
          type="button"
          className={styles.barButton}
          data-region="guides"
          aria-label={LAYOUT.guides}
          title={LAYOUT.guides}
          disabled={!data.ready}
          onClick={() => store.dispatch({ type: "toggleGuides" })}
        >
          <ListChecks size={14} aria-hidden />
          <span className={styles.barLabel}>{LAYOUT.guides}</span>
          {seen > 0 && catalog ? <SeenBadge copy={copy} n={seen} of={catalog.length} /> : null}
        </button>
      )}
      <button
        type="button"
        className={styles.barButton}
        data-region="explain-button"
        aria-pressed={state.help}
        aria-keyshortcuts="Shift+?"
        disabled={!data.ready}
        onClick={() => store.dispatch({ type: "help", on: !state.help })}
      >
        <span className={styles.keyCap} aria-hidden="true">
          ?
        </span>
        <span className={styles.barLabel}>{state.help ? HELP.explaining : HELP.explain}</span>
      </button>
      <button
        type="button"
        className={`${styles.barButton} ${styles.squeezable}`}
        data-region="glossary-button"
        aria-expanded={state.gloss.open}
        aria-keyshortcuts="G"
        aria-label={HELP.glossary}
        title={HELP.glossary}
        onClick={() => store.dispatch({ type: "gloss", open: !state.gloss.open })}
      >
        <BookOpen size={14} aria-hidden />
        <span className={styles.barLabel}>{HELP.glossary}</span>
      </button>
    </div>
  );
}

/** "2 of 5 seen" beside Guides; its words come with the guide copy, loaded once the page has painted. */
function SeenBadge({ copy, n, of }: { copy: BoundCopy; n: number; of: number }) {
  const later = useLater(copy);
  if (later.status !== "ready") return null;
  return <span className={styles.badge}>{later.copy.GUIDE.seenCount(n, of)}</span>;
}

/* ------------------------------------------------------------------ the masthead link and the narrow menu */

export function HowLink({ copy }: { copy: BoundCopy }) {
  const store = useLayerStore();
  const { state } = useLayers();
  return (
    <span className={styles.howWrap}>
      <button
        type="button"
        className={styles.mastHow}
        data-region="how-link"
        aria-pressed={state.page === "how"}
        onClick={() => store.dispatch({ type: "page", page: state.page ? null : "how" })}
      >
        {copy.LAYOUT.howTitle}
      </button>
    </span>
  );
}

/**
 * The narrow layout's menu: Guides, Explain this screen and Glossary of terms, then the workspace's own actions.
 * Escape closes it and hands focus back to its button.
 */
export function GuideMenu({
  copy,
  ready,
  children,
}: {
  copy: BoundCopy;
  ready: boolean;
  children?: ReactNode;
}) {
  const store = useLayerStore();
  const { state } = useLayers();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node))
        setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    window.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", key, true);
    };
  }, [open]);
  const act = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const { LAYOUT, HELP } = copy;
  return (
    <span className={styles.menuWrap}>
      <HowLink copy={copy} />
      <button
        ref={button}
        type="button"
        className={styles.menuButton}
        aria-expanded={open}
        aria-controls="screening-menu"
        onClick={() => setOpen((v) => !v)}
      >
        <MenuIcon size={16} aria-hidden />
        {LAYOUT.menu}
      </button>
      {open ? (
        <div ref={menu} id="screening-menu" className={styles.menu} role="group" aria-label={LAYOUT.menu}>
          <button
            type="button"
            disabled={!ready}
            aria-pressed={state.rail.kind !== "off"}
            onClick={act(() => store.dispatch({ type: "toggleGuides" }))}
          >
            {LAYOUT.guides}
          </button>
          <button
            type="button"
            disabled={!ready}
            aria-pressed={state.help}
            onClick={act(() => store.dispatch({ type: "help", on: !state.help }))}
          >
            {state.help ? HELP.explaining : HELP.explain}
          </button>
          <button
            type="button"
            aria-expanded={state.gloss.open}
            onClick={act(() => store.dispatch({ type: "gloss", open: !state.gloss.open }))}
          >
            {HELP.glossary}
          </button>
          {children}
        </div>
      ) : null}
    </span>
  );
}
