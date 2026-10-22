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
import { BookOpen, BookText, CircleHelp, ListChecks, Menu as MenuIcon } from "lucide-react";
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  // The plan waits for the rules as well as the list, so a link to a guide is read against every guide the data offers.
  const { urgencyRule } = data;
  const plan = useMemo(
    () =>
      roles && urgencyRule !== null ? planOf(roles, { export: canExport, grouping, urgencyRule }) : null,
    [roles, canExport, grouping, urgencyRule]
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
  // On a phone the start list sits at the top of the list region and scrolls with it, so it covers nothing and
  // nothing covers it. A guide's steps keep the map band, where they point at the map and the list below.
  // On a narrow screen Start here is a short card at the head of the list region, whichever of List and Map shows. A
  // school's card takes the list region's place, so with a card open Start here takes the band, where it can still be
  // reached (as All guides does from a guide that opened a card).
  const school = useWorkspaceState().school;
  const inflow = data.mode === "narrow" && state.rail.kind === "start" && school === null;
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setSlot(inflow ? (root?.querySelector<HTMLElement>('[data-slot="start-slot"]') ?? null) : null);
  }, [inflow, root]);
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
      // Help, which holds Guides: the list panel's, or the top bar's in the narrow layout; only one of them shows.
      [...(root?.querySelectorAll<HTMLElement>('[data-region="help-button"]') ?? [])]
        .find((button) => button.getClientRects().length > 0)
        ?.focus();
    wasOpen.current = railOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when the rail opens or closes.
  }, [railOpen, root]);
  return (
    <>
      {/* The map bar holds only the method details' Map layers: every kind of help is under Help. */}
      {data.mode === "narrow" ? null : mapBarItems ? (
        <MapBar root={root} data={data} items={mapBarItems} />
      ) : (
        <ClearOfActions root={root} rail={frame.rail ?? 0} />
      )}
      {railOpen && (!inflow || slot)
        ? placed(
            <div
              className={styles.rail}
              data-testid="guide-rail"
              data-guidance=""
              data-inflow={inflow || undefined}
              data-present={(state.present && isStepping(state.rail) && data.mode !== "narrow") || undefined}
              data-step={isStepping(state.rail) || undefined}
            >
              <LazyLayer
                load={loadRail}
                loading={<Busy text={LAYOUT.loadingGuide} />}
                copy={data.copy}
                props={{ root, data, roles, plan, compact: inflow }}
              />
            </div>,
            inflow ? slot : null
          )
        : null}
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

/**
 * Without the map bar, the hint and the zoom buttons still keep clear of the actions: the hint sits under them, however
 * many rows they take, and the zoom buttons stay at the map's top left unless the actions reach over them, as they do
 * when the rail leaves the map narrow. Where both go is set on the root (`--hint-top`, `--zoom-top`).
 */
function ClearOfActions({ root, rail }: { root: HTMLElement | null; rail: number }) {
  useLayoutEffect(() => {
    if (!root) return;
    let frame = 0;
    const check = () => {
      const box = root.getBoundingClientRect();
      const actions = root.querySelector('[data-region="actions"]')?.getBoundingClientRect();
      const zoom = root.querySelector(".maplibregl-ctrl-top-left")?.getBoundingClientRect();
      const shown = !!actions && actions.width > 0;
      const under = Math.max(
        HINT_TOP,
        shown ? Math.round(actions.bottom - box.top) + BELOW_ACTIONS : HINT_TOP
      );
      root.style.setProperty("--hint-top", `${under}px`);
      root.style.setProperty("--actions-under", `${under}px`);
      const over = shown && !!zoom && zoom.width > 0 && actions.left < zoom.right + AFTER_BAR;
      if (over) root.style.setProperty("--zoom-top", `${under}px`);
      else root.style.removeProperty("--zoom-top");
    };
    const sized = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(check);
    });
    sized.observe(root);
    // The actions can be put back and the zoom buttons come with the map, after the list. Each time one of them
    // appears, look at once, in the same task, so no frame shows the zoom buttons under the actions.
    // MapLibre puts the zoom buttons' corner in empty, then the buttons into it: it counts once it has a size.
    let actions: Element | null = null;
    let zoom: Element | null = null;
    const placed = () => {
      const nextActions = root.querySelector('[data-region="actions"]');
      const corner = root.querySelector(".maplibregl-ctrl-top-left");
      const nextZoom =
        corner === zoom ? zoom : corner && corner.getBoundingClientRect().width > 0 ? corner : null;
      if (nextActions === actions && nextZoom === zoom) return;
      if (actions) sized.unobserve(actions);
      if (nextActions) sized.observe(nextActions);
      actions = nextActions;
      zoom = nextZoom;
      check();
    };
    const added = new MutationObserver(placed);
    added.observe(root, { childList: true, subtree: true });
    placed();
    check();
    return () => {
      cancelAnimationFrame(frame);
      sized.disconnect();
      added.disconnect();
      root.style.removeProperty("--hint-top");
      root.style.removeProperty("--actions-under");
      root.style.removeProperty("--zoom-top");
    };
    // The rail opening or widening narrows the map under the same actions.
  }, [root, rail]);
  return null;
}

/** `node` where it belongs: in `slot` when one is given, else where the layer renders it. */
const placed = (node: ReactNode, slot: HTMLElement | null) => (slot ? createPortal(node, slot) : node);

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
  const { state } = useLayers();
  const { LAYOUT } = data.copy;
  const bar = useRef<HTMLDivElement>(null);

  // When the bar would touch the actions it steps down below them (two rows of them when the rail leaves the map
  // narrow); when it would then touch the card, its buttons keep only their icons. Their names stay in aria-label
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
      root.style.setProperty("--actions-under", `${underActions}px`);
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
  // The bar marks the root while it shows; without it (no method details, or the narrow layout) its marks go.
  useEffect(() => {
    root?.setAttribute("data-mapbar", "");
    return () => {
      root?.removeAttribute("data-mapbar");
      root?.removeAttribute("data-bar-stack");
      root?.removeAttribute("data-bar-tight");
      root?.style.removeProperty("--bar-top");
      root?.style.removeProperty("--hint-top");
      root?.style.removeProperty("--actions-under");
    };
  }, [root]);

  return (
    <div
      ref={bar}
      className={styles.mapbar}
      role="toolbar"
      aria-label={LAYOUT.mapbarAria}
      data-region="mapbar"
    >
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

/* ------------------------------------------------------------------ Help, and the narrow layout's menu */

/** Wraps a menu choice so it closes the menu and hands focus back to the menu button if nothing else takes it. */
export type MenuAct = (fn: () => void) => () => void;

/**
 * A button that opens a short menu under it. A choice closes it; Escape closes it and hands focus back to its button,
 * as does a choice that leaves focus nowhere. Choices given as a function get the menu's own way to act.
 */
function PopMenu({
  id,
  label,
  name,
  icon,
  region,
  children,
}: {
  id: string;
  label: string;
  /** The accessible name, when it says more than the visible label; it starts with the label. */
  name?: string;
  icon: ReactNode;
  region: string;
  children: (act: MenuAct) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const tabbing = useRef(false);
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
  // A choice acts from the menu's button: the layer it opens takes the button as its opener and hands focus back to
  // it on closing, since the choice itself goes with the menu.
  const act: MenuAct = (fn) => () => {
    setOpen(false);
    button.current?.focus({ preventScroll: true });
    fn();
    requestAnimationFrame(() => {
      if (!document.activeElement || document.activeElement === document.body) button.current?.focus();
    });
  };
  return (
    <span
      className={styles.menuWrap}
      data-menu-open={open || undefined}
      // Tabbing out of the list closes it, so it never stays open over the map. Only the reader's Tab does: the
      // workspace moving focus itself (a card taking it as the list steps aside) leaves the list as the reader left
      // it, and a press elsewhere is the pointer handler's.
      onKeyDown={(event) => {
        tabbing.current = event.key === "Tab";
      }}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        const leaving = tabbing.current && !(next && event.currentTarget.contains(next));
        tabbing.current = false;
        if (open && leaving) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        className={styles.menuButton}
        data-region={region}
        aria-label={name}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        {icon}
        {label}
      </button>
      {open ? (
        <div ref={menu} id={id} className={styles.menu} role="group" aria-label={name ?? label}>
          {children(act)}
        </div>
      ) : null}
    </span>
  );
}

/**
 * Help: the one way to every kind of help, in a fixed place, the top right of the list panel (the top bar in the
 * narrow layout). Guides opens or hides Start here, which a first visit opens on its own; Explain this screen, the
 * glossary and How this works follow. "?" and "g" still open help mode and the glossary from the keyboard.
 */
export function HelpMenu({ copy, ready }: { copy: BoundCopy; ready: boolean }) {
  const store = useLayerStore();
  const { state, memory, catalog } = useLayers();
  const { LAYOUT, HELP } = copy;
  const seen = catalog ? seenCount(memory, catalog) : 0;
  return (
    <PopMenu
      id="screening-help-menu"
      label={LAYOUT.help}
      name={LAYOUT.helpAria}
      region="help-button"
      icon={<CircleHelp size={15} aria-hidden />}
    >
      {(act) => (
        <>
          <button
            type="button"
            data-region="guides"
            disabled={!ready}
            aria-pressed={state.rail.kind !== "off"}
            onClick={act(() => store.dispatch({ type: "toggleGuides" }))}
          >
            <ListChecks size={14} aria-hidden />
            {LAYOUT.guides}
            {seen > 0 && catalog ? <SeenBadge copy={copy} n={seen} of={catalog.length} /> : null}
          </button>
          <button
            type="button"
            data-region="explain-button"
            disabled={!ready}
            aria-pressed={state.help}
            aria-keyshortcuts="Shift+?"
            onClick={act(() => store.dispatch({ type: "help", on: !state.help }))}
          >
            <span className={styles.keyCap} aria-hidden="true">
              ?
            </span>
            {state.help ? HELP.explaining : HELP.explain}
          </button>
          <button
            type="button"
            data-region="glossary-button"
            aria-expanded={state.gloss.open}
            aria-keyshortcuts="G"
            onClick={act(() => store.dispatch({ type: "gloss", open: !state.gloss.open }))}
          >
            <BookOpen size={14} aria-hidden />
            {HELP.glossary}
          </button>
          <button
            type="button"
            data-region="how-link"
            aria-pressed={state.page === "how"}
            onClick={act(() => store.dispatch({ type: "page", page: state.page ? null : "how" }))}
          >
            <BookText size={14} aria-hidden />
            {LAYOUT.howTitle}
          </button>
        </>
      )}
    </PopMenu>
  );
}

/** The narrow layout's Menu: the workspace's own actions, which the wider layouts show over the map. */
export function ActionsMenu({ copy, children }: { copy: BoundCopy; children: (act: MenuAct) => ReactNode }) {
  return (
    <PopMenu
      id="screening-menu"
      label={copy.LAYOUT.menu}
      region="actions-menu"
      icon={<MenuIcon size={16} aria-hidden />}
    >
      {children}
    </PopMenu>
  );
}
