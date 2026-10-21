"use client";

/**
 * The guidance layers' mount point in the workspace. What ships with the page is small: the map bar (Guides,
 * Explain this screen, Glossary of terms, and the method details' Map layers at its end), the rail's frame, the How
 * this works link and the narrow layout's menu.
 * The rail's contents, the page, help mode and the glossary load the first time they open, with the copy they need.
 *
 * Which guides the data can teach is decided here, from the loaded data (R13), so the Guides button can say how
 * many a returning user has seen without loading the guides.
 */
import { BookOpen, ListChecks, Menu as MenuIcon } from "lucide-react";
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { type BoundCopy, LAYOUT } from "@/lib/screening/copy";
import { isStepping, seenCount } from "@/lib/screening/guide/machine";
import { catalogOf, planOf, rolesOf } from "@/lib/screening/guide/roles";

import { useWorkspaceState } from "../WorkspaceProvider";
import { reducedMotion } from "./dom";
import { useActed, useGuidanceFrame, useKeyboardRef, useLayerStore, useLayers } from "./GuidanceProvider";
import { LazyLayer } from "./GuidanceBoundary";
import type { GuideData } from "./types";
import { useLater } from "./useLater";
import styles from "./guide.module.css";

// While a layer's code downloads it says what is loading, in the copy system's words.
const Busy = ({ text }: { text: string }) => (
  <div aria-busy="true">
    <p role="status">{text}</p>
  </div>
);
// Each layer's code is its own chunk, fetched the first time the layer opens (and again on Retry).
const loadRail = () => import("./Rail");
const loadHowPage = () => import("../how/HowPage");
const loadHelpLayer = () => import("../help/HelpLayer");
const loadGlossary = () => import("../help/Glossary");

/** The map bar's own classes, for buttons another layer puts at the end of the bar. */
export interface MapBarClasses {
  /** A bar button that keeps only its icon when the bar is tight. */
  readonly button: string;
  readonly label: string;
}

export function GuidanceLayer({
  root,
  data,
  mapBarItems = null,
}: {
  root: HTMLElement | null;
  data: GuideData;
  /** Buttons for the end of the map bar: the method details' Map layers while they are on. */
  mapBarItems?: ((classes: MapBarClasses) => ReactNode) | null;
}) {
  const store = useLayerStore();
  const { state } = useLayers();
  const frame = useGuidanceFrame(data.width);
  const keyboard = useKeyboardRef();

  const roles = useMemo(
    () => (data.shown ? rolesOf(data.shown.schools, data.shown.copy) : null),
    [data.shown]
  );
  const { export: canExport, grouping } = data.features;
  const plan = useMemo(
    () => (roles ? planOf(roles, { export: canExport, grouping, proposed: data.proposed }) : null),
    [roles, canExport, grouping, data.proposed]
  );
  useEffect(() => {
    if (plan) store.setCatalog(catalogOf(plan));
  }, [store, plan]);

  // The panels slide to their new place when the rail opens, closes or widens; a key moves them at once, and the
  // rail a first visit opens with is in place before the first paint.
  const lastRail = useRef(frame.rail ?? 0);
  const painted = useRef(false);
  useEffect(() => {
    const frameId = requestAnimationFrame(() => (painted.current = true));
    return () => cancelAnimationFrame(frameId);
  }, []);
  useLayoutEffect(() => {
    const rail = frame.rail ?? 0;
    const dx = lastRail.current - rail;
    lastRail.current = rail;
    const stage = root?.querySelector<HTMLElement>('[data-slot="stage"]');
    if (!dx || !stage || !painted.current || keyboard.current || reducedMotion() || data.mode === "narrow")
      return;
    stage.animate([{ transform: `translateX(${dx}px)` }, { transform: "none" }], {
      duration: 240,
      easing: "cubic-bezier(0.23, 1, 0.32, 1)",
    });
  }, [frame.rail, root, keyboard, data.mode]);

  // How this works makes the workspace under it inert, which takes focus off the button that opened it. Remember
  // that button in the same commit, before the browser moves focus, and give focus back to it when the page closes.
  const pageTrigger = useRef<HTMLElement | null>(null);
  const pageOpen = state.page !== null;
  useLayoutEffect(() => {
    if (pageOpen) {
      pageTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      return;
    }
    const trigger = pageTrigger.current;
    pageTrigger.current = null;
    const lost = !document.activeElement || document.activeElement === document.body;
    if (trigger?.isConnected && (lost || !!document.activeElement?.closest('[data-region="how-page"]')))
      trigger.focus({ preventScroll: true });
  }, [pageOpen]);

  const railOpen = state.rail.kind !== "off";
  // A rail a person closes hands focus to the Guides button that reopens it.
  const acted = useActed();
  const wasOpen = useRef(railOpen);
  useEffect(() => {
    if (
      wasOpen.current &&
      !railOpen &&
      acted() &&
      (!document.activeElement || document.activeElement === document.body)
    )
      // The map bar's Guides button, or in the narrow layout the menu that holds it; only one of them shows.
      [
        ...(root?.querySelectorAll<HTMLElement>('[data-region="guides"], [aria-controls="screening-menu"]') ??
          []),
      ]
        .find((button) => button.getClientRects().length > 0)
        ?.focus();
    wasOpen.current = railOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when the rail opens or closes.
  }, [railOpen, root]);
  return (
    <>
      {data.mode !== "narrow" ? <MapBar root={root} data={data} items={mapBarItems} /> : null}
      {railOpen ? (
        <div
          className={styles.rail}
          data-testid="guide-rail"
          data-guidance=""
          data-present={(state.present && isStepping(state.rail) && data.mode !== "narrow") || undefined}
          data-step={isStepping(state.rail) || undefined}
        >
          <LazyLayer
            load={loadRail}
            loading={<Busy text={LAYOUT.loadingGuide} />}
            copy={data.copy}
            props={{ root, data, roles, plan }}
          />
        </div>
      ) : null}
      {state.page ? (
        <LazyLayer
          load={loadHowPage}
          loading={<Busy text={LAYOUT.loadingHow} />}
          copy={data.copy}
          props={{ data }}
        />
      ) : null}
      {state.help || state.card ? (
        <LazyLayer load={loadHelpLayer} loading={null} copy={data.copy} props={{ root, data, roles }} />
      ) : null}
      {state.gloss.open ? (
        <LazyLayer
          load={loadGlossary}
          loading={<Busy text={LAYOUT.loadingGlossary} />}
          copy={data.copy}
          props={{ root, data }}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ the map bar */

/** The map bar's spacing, in px: the window edge, below the actions, and below the bar (where the zoom buttons go). */
const GAP = 16;
const BELOW_ACTIONS = 14;
const AFTER_BAR = 8;
/** Where the hint sits with no actions to sit under. */
const HINT_TOP = 64;

function MapBar({
  root,
  data,
  items,
}: {
  root: HTMLElement | null;
  data: GuideData;
  items: ((classes: MapBarClasses) => ReactNode) | null;
}) {
  const store = useLayerStore();
  const { state, memory, catalog } = useLayers();
  const { copy } = data;
  const { LAYOUT, HELP } = copy;
  const bar = useRef<HTMLDivElement>(null);
  const seen = catalog ? seenCount(memory, catalog) : 0;

  // When the bar would touch the actions it steps down below them (two rows of them when the rail leaves the map
  // narrow); when it would then touch the card, the glossary button keeps only its icon. Its name stays in aria-label
  // and title. The hint under the actions steps below the bar when the bar would touch it. Where the bar and the hint
  // sit goes on the root (`--bar-top`, `--hint-top`), so the zoom buttons follow the bar.
  const full = useRef(0);
  const school = useWorkspaceState().school;
  const more = items !== null;
  useLayoutEffect(() => {
    const element = bar.current;
    if (!element || !root) return;
    // What the bar holds may have changed, so its full width is measured again before the check.
    element.removeAttribute("data-bar-tight");
    element.removeAttribute("data-bar-icons");
    const check = () => {
      if (!element.hasAttribute("data-bar-tight")) full.current = element.offsetWidth;
      const box = root.getBoundingClientRect();
      const top = box.top;
      const left = element.getBoundingClientRect().left;
      const right = left + full.current + 8;
      // Even a row down, the bar with its names would pass the window's edge (a wide column beside the rail): every
      // button keeps only its icon, as in the compact layout.
      const icons = right > box.right - GAP;
      const actions = root.querySelector('[data-region="actions"]')?.getBoundingClientRect();
      const shown = !!actions && actions.width > 0;
      // A row down, the bar meets the card, or the hint that holds the card's place.
      const below = ['[data-region="inspector"]', '[data-region="slot-hint"]']
        .map((selector) => root.querySelector(selector)?.getBoundingClientRect())
        .filter((box): box is DOMRect => !!box && box.width > 0);
      const stack = shown && right > actions.left;
      const squeeze = stack && below.some((box) => right > box.left);
      for (const node of [element, root]) {
        node.toggleAttribute("data-bar-stack", stack);
        node.toggleAttribute("data-bar-tight", squeeze || icons || data.mode === "compact");
      }
      element.toggleAttribute("data-bar-icons", icons);
      // One row of actions ends 50 px down, so the stepped-down bar and the hint sit at 64 px, as specified; a second
      // row of actions moves both down with it.
      const underActions = shown ? Math.round(actions.bottom - top) + BELOW_ACTIONS : HINT_TOP;
      const barTop = stack ? underActions : GAP;
      const barBottom = barTop + element.offsetHeight;
      const hint = root.querySelector('[data-region="slot-hint"]')?.getBoundingClientRect();
      const hintMeetsBar =
        !!hint &&
        hint.width > 0 &&
        right > hint.left &&
        left < hint.right &&
        barTop < underActions + hint.height &&
        barBottom > underActions;
      root.style.setProperty("--bar-top", `${barTop}px`);
      root.style.setProperty("--hint-top", `${hintMeetsBar ? barBottom + AFTER_BAR : underActions}px`);
    };
    check();
    // The card and the slot hint come and go with the selection; check again once they have.
    let frame = requestAnimationFrame(check);
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(check);
    });
    observer.observe(root);
    // The bar widens on its own ("Explaining this screen" in help mode), the actions wrap to a second row, and the
    // hint rewraps, all without the root changing size.
    observer.observe(element);
    for (const selector of ['[data-region="actions"]', '[data-region="slot-hint"]']) {
      const part = root.querySelector(selector);
      if (part) observer.observe(part);
    }
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [root, data.mode, data.ready, state.rail.kind, state.gloss.open, school, more]);
  // The narrow layout has no map bar: its marks on the root go with it.
  useEffect(
    () => () => {
      root?.removeAttribute("data-bar-stack");
      root?.removeAttribute("data-bar-tight");
      root?.style.removeProperty("--bar-top");
      root?.style.removeProperty("--hint-top");
    },
    [root]
  );

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
      {items?.({ button: `${styles.barButton} ${styles.squeezable}`, label: styles.barLabel })}
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

/** Wraps a menu choice so it closes the menu and hands focus back to the menu button if nothing else takes it. */
export type MenuAct = (fn: () => void) => () => void;

/**
 * The narrow layout's menu: Guides, Explain this screen and Glossary of terms, then the workspace's own actions.
 * Escape closes it and hands focus back to its button. Actions given as a function get the menu's own way to act.
 */
export function GuideMenu({
  copy,
  ready,
  children,
}: {
  copy: BoundCopy;
  ready: boolean;
  children?: ReactNode | ((act: MenuAct) => ReactNode);
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
  // A choice closes the menu; focus goes to what it opened, or back to the menu button.
  const act: MenuAct = (fn) => () => {
    setOpen(false);
    fn();
    requestAnimationFrame(() => {
      if (!document.activeElement || document.activeElement === document.body) button.current?.focus();
    });
  };
  const { LAYOUT, HELP } = copy;
  return (
    <span className={styles.menuWrap} data-menu-open={open || undefined}>
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
          {typeof children === "function" ? children(act) : children}
        </div>
      ) : null}
    </span>
  );
}
