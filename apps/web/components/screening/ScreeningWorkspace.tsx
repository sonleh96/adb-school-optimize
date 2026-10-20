"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Link2, MousePointerClick } from "lucide-react";
import {
  Component,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { type BoundCopy, type CopyRuleId, DEFAULT_RULE, PROPOSED_RULE, copyFor } from "@/lib/screening/copy";
import { screeningKeys, useAfterPaint } from "@/lib/screening/hooks";
import { neighbour, reconcileSelection, splitRows, tabOf } from "@/lib/screening/list";
import { type MapSchool, bandsOf, toMapSchools } from "@/lib/screening/marks";
import type { SchoolKey } from "@/lib/screening/types";
import { layoutOf, mapPadding } from "@/lib/screening/workspace/layout";
import type { ListView, QueueGrouping } from "@/lib/screening/workspace/state";

import { Legend } from "./Legend";
import type { TipContent } from "./MapTooltip";
import { RuleArea, focusRuleControl } from "./RuleArea";
import { SchoolCard } from "./SchoolCard";
import { IncompleteList, OrderedList, incompleteGroups } from "./SchoolList";
import { ScreeningMap } from "./ScreeningMap";
import { useScreeningData } from "./useScreeningData";
import { WhatChanged } from "./WhatChanged";
import { WorkspaceProvider, useWorkspaceState, useWorkspaceStore } from "./WorkspaceProvider";
import styles from "./screening.module.css";

/** The tabs in screen order, and how far each arrow key moves along them. */
const VIEWS: readonly ListView[] = ["ranked", "queue"];
const TAB_STEP: Partial<Record<string, number>> = { ArrowRight: 1, ArrowLeft: -1 };
const NO_SCHOOLS: readonly MapSchool[] = [];

export function ScreeningWorkspace() {
  return (
    <WorkspaceProvider>
      <UnreadableData>
        <Workspace />
      </UnreadableData>
    </WorkspaceProvider>
  );
}

/**
 * Data that parses but cannot be worded, such as a comparison that makes binding the copy throw, would otherwise blank
 * the page. This shows the failed state instead. Retry drops what was read and starts the workspace again; the state
 * and the URL stay.
 */
class UnreadableData extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError = () => ({ failed: true });
  render() {
    return this.state.failed ? (
      <FailedWorkspace onRetry={() => this.setState({ failed: false })} />
    ) : (
      this.props.children
    );
  }
}

/** The failed state on its own: the column with one sentence and Retry, over a map with no marks. */
function FailedWorkspace({ onRetry }: { onRetry: () => void }) {
  const store = useWorkspaceStore();
  const queries = useQueryClient();
  const copy = useMemo(() => copyFor({}), []);
  const loadMap = useAfterPaint(true);
  const viewport = useViewport();
  const layout = layoutOf({ width: viewport.width, height: viewport.height, cardOpen: false });
  const padding = useMemo(() => mapPadding(layout, false), [layout]);
  return (
    <div
      className={styles.root}
      data-testid="screening-workspace"
      data-layout={layout.mode}
      aria-label={copy.LAYOUT.workspaceAria}
      style={layout.band ? ({ "--band": `${layout.band}px` } as React.CSSProperties) : undefined}
    >
      <div className={styles.stage}>
        <ScreeningMap
          load={loadMap}
          schools={NO_SCHOOLS}
          selectedKey={null}
          onSelect={() => {}}
          padding={padding}
          stale={false}
          onDrawn={store.markReady}
          hoverKey={null}
          onHoverChange={() => {}}
          tipFor={() => null}
          emphasis="all"
          frame={0}
          instant={false}
          label={copy.LAYOUT.mapAria}
          attribution={copy.LAYOUT.attribution}
        />
        <Masthead copy={copy} className={styles.topBar} />
        <section className={`${styles.panel} ${styles.column}`} aria-label={copy.LAYOUT.productName}>
          <Masthead copy={copy} />
          <div className={styles.listScroll}>
            <FullPanelState
              copy={copy}
              failure="malformed"
              retrying={false}
              retry={() => {
                // Nothing reads the screening data while this shows, so it can all be dropped and read afresh.
                queries.removeQueries({ queryKey: screeningKeys.all });
                onRetry();
              }}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

/** The window's size. The server renders for the design's reference size; the browser corrects it before paint. */
const SERVER_VIEWPORT = "1600x1000";
function subscribeResize(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}
function useViewport(): { width: number; height: number } {
  const size = useSyncExternalStore(
    subscribeResize,
    () => `${window.innerWidth}x${window.innerHeight}`,
    () => SERVER_VIEWPORT
  );
  const [width, height] = size.split("x").map(Number);
  return { width, height };
}

/**
 * Whether the last action came from the keyboard. Keyboard actions never animate: the column, the card and the map
 * move at once after a key, and with motion after a click.
 */
function useKeyboardLast(root: React.RefObject<HTMLElement | null>): boolean {
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const key = (event: KeyboardEvent) => {
      if (!["Shift", "Control", "Alt", "Meta"].includes(event.key)) setKeyboard(true);
    };
    const point = () => setKeyboard(false);
    element.addEventListener("keydown", key, true);
    element.addEventListener("pointerdown", point, true);
    return () => {
      element.removeEventListener("keydown", key, true);
      element.removeEventListener("pointerdown", point, true);
    };
  }, [root]);
  return keyboard;
}

/**
 * The product's name. It heads the column; in the narrow layout the same masthead is the top bar, with the actions.
 * The stylesheet shows one of the two, so the page always has one visible heading.
 */
function Masthead({
  copy,
  actions,
  className = styles.masthead,
}: {
  copy: BoundCopy;
  actions?: React.ReactNode;
  className?: string;
}) {
  const { LAYOUT } = copy;
  return (
    <header className={className}>
      <svg className={styles.logo} viewBox="0 0 108 108" role="img" aria-label={LAYOUT.logoAria}>
        <rect width="108" height="108" fill="#0a2e73" />
        <text x="54" y="68" fill="#fff" fontSize="48" textAnchor="middle">
          ADB
        </text>
      </svg>
      <h1 className={styles.mastName}>{LAYOUT.productName}</h1>
      <p className={styles.mastSub}>{LAYOUT.productSub}</p>
      {actions ? <div className={styles.mastActions}>{actions}</div> : null}
    </header>
  );
}

function CopyLink({
  copy,
  disabled,
  onCopied,
  compact,
}: {
  copy: BoundCopy;
  disabled: boolean;
  onCopied: (message: string) => void;
  compact?: boolean;
}) {
  const { LAYOUT } = copy;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      onCopied(LAYOUT.linkCopied);
    } catch {
      onCopied(LAYOUT.linkNotCopied);
    }
  };
  return (
    <button
      type="button"
      className={compact ? styles.barButton : styles.actionButton}
      disabled={disabled}
      title={disabled ? LAYOUT.availableAfterLoad : undefined}
      onClick={() => void copyLink()}
    >
      {compact ? <Link2 size={14} aria-hidden /> : null}
      {LAYOUT.copyLink}
    </button>
  );
}

function Workspace() {
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const [toast, setToast] = useState<{ message: string; at: number } | null>(null);
  const [pointerHover, setPointerHover] = useState<SchoolKey | null>(null);
  const store = useWorkspaceStore();
  const state = useWorkspaceState();
  const data = useScreeningData();
  const { view, stale, shown } = data;
  const copy = shown?.copy ?? data.idleCopy;
  // Ready once the list and the comparison the statement reads have both settled. Until then the column shows only
  // its masthead and one loading line, so nothing on screen moves when the rule area, tabs and rows arrive together.
  const ready = view.kind === "ready" && shown !== null && !data.empty && data.statementReady;
  const firstLoad = !ready && !data.empty && view.kind !== "failed";
  const keyboard = useKeyboardLast(root);

  // The map's script is fetched once the list (or its failure) has been painted.
  const loadMap = useAfterPaint(view.kind !== "loading" || data.empty);

  const rows = useMemo(() => shown?.response.rows ?? [], [shown]);
  const { ordered, incomplete } = useMemo(() => splitRows(rows), [rows]);
  const schools = useMemo(() => new Map((shown?.schools ?? []).map((s) => [s.id, s])), [shown]);
  const bands = useMemo(() => bandsOf(rows), [rows]);
  const mapSchools = useMemo(() => toMapSchools(rows, bands), [rows, bands]);

  // One selection serves the list, the map and the card. A school the current rows do not hold is no selection.
  const selectedKey = reconcileSelection(state.school, rows);
  const selectedRow = useMemo(
    () => (selectedKey ? (rows.find((row) => row.school.school_key === selectedKey) ?? null) : null),
    [rows, selectedKey]
  );
  const selectedSchool = selectedKey ? (schools.get(selectedKey) ?? null) : null;

  // The list follows the selection: a school picked on the map, or one that another rule moves between the
  // ordered list and the incomplete records, is shown on the tab that holds it.
  const selectedTab: ListView | null = selectedRow
    ? tabOf(selectedRow) === "incomplete"
      ? "queue"
      : "ranked"
    : null;
  useEffect(() => {
    if (selectedTab && selectedTab !== store.snapshot().view) store.setState({ view: selectedTab });
  }, [store, selectedTab, selectedKey]);

  const viewport = useViewport();
  const cardOpen = selectedSchool !== null;
  const layout = layoutOf({ width: viewport.width, height: viewport.height, cardOpen });
  // The same object while its values hold, so the map does not re-run its framing on unrelated renders.
  const { mode, docked, column, card } = layout;
  const padding = useMemo(
    () => mapPadding(layout, cardOpen),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `layout` is rebuilt each render; its fields are the key.
    [mode, docked, column, card, cardOpen]
  );
  // Each time the clear part of the map changes shape, the map frames the country in it again.
  const [frame, setFrame] = useState(0);
  const shape = `${layout.mode}:${layout.docked}`;
  const lastShape = useRef(shape);
  useEffect(() => {
    if (lastShape.current === shape) return;
    lastShape.current = shape;
    setFrame((n) => n + 1);
  }, [shape]);

  const select = useCallback((key: SchoolKey | null) => store.setState({ school: key }), [store]);

  // Closing the card or pressing Escape hands focus back to the school's row, so a keyboard user is not dropped.
  const clearSelection = useCallback(() => {
    const key = selectedKey;
    store.setState({ school: null });
    if (!key) return;
    requestAnimationFrame(() => {
      root.current?.querySelector<HTMLElement>(`[data-school-key="${CSS.escape(key)}"]`)?.focus();
    });
  }, [store, selectedKey]);

  // The card steps through the list on screen, in its order.
  const onScreen =
    state.view !== "queue"
      ? ordered
      : shown
        ? incompleteGroups(incomplete, schools, shown.copy, state.qgroup).flatMap((group) => group.rows)
        : incomplete;
  const position = {
    index: selectedKey ? onScreen.findIndex((row) => row.school.school_key === selectedKey) : -1,
    total: onScreen.length,
  };
  const step = (delta: 1 | -1) => {
    const next = neighbour(onScreen, selectedKey, delta);
    if (next) select(next);
  };

  const showTab = (next: ListView) => {
    // A school the other tab does not hold stops being the selection.
    const keep = selectedTab === null || selectedTab === next;
    store.setState({ view: next, ...(keep ? {} : { school: null }) });
    list.current?.scrollTo({ top: 0 });
  };
  const changeRule = (rule: CopyRuleId) => {
    if (rule === data.requested) return;
    // What changed compares with the list the user last saw. A rule pressed and left before its list came in was
    // never on screen, so it is not the one compared with.
    store.setState({ rule, compare: shown?.rule ?? data.requested });
  };
  const seeWithout = () => {
    store.setState({ rule: PROPOSED_RULE, compare: DEFAULT_RULE, view: "ranked" });
    list.current?.scrollTo({ top: 0 });
  };
  const backToMain = () => store.setState({ rule: null, compare: null });
  // What changed's own controls remove it, so focus goes to the rule's control in the switch.
  const hideComparison = () => {
    store.setState({ compare: null });
    focusRuleControl(root.current);
  };
  const backFromComparison = () => {
    backToMain();
    focusRuleControl(root.current);
  };

  const notify = useCallback((message: string) => setToast({ message, at: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.message === copy.LAYOUT.linkCopied ? 1800 : 5000);
    return () => clearTimeout(timer);
  }, [toast, copy.LAYOUT.linkCopied]);

  // What the map's tooltip says, in the copy's words (R17): the one display name, the location, the place.
  const tipFor = useCallback(
    (key: SchoolKey): TipContent | null => {
      const school = schools.get(key);
      if (!shown || !school) return null;
      const sentence = shown.copy.rankSentence(school, shown.rule);
      const first = sentence.split(/(?<=\.) /)[0];
      return {
        name: shown.copy.distinctName(school),
        where: shown.copy.locationLine(school),
        place: school.cohort === "complete" ? sentence : first,
        note: school.cohort === "interval" ? shown.copy.LAYOUT.legendNoAirQuality : null,
        hint: shown.copy.LAYOUT.tooltipHint,
      };
    },
    [schools, shown]
  );

  const comparing = data.comparison !== null && state.view === "ranked";
  const scopeOpen = state.scope;
  const groupBy = (qgroup: QueueGrouping) => {
    if (qgroup === state.qgroup) return;
    store.setState({ qgroup });
    list.current?.scrollTo({ top: 0 });
  };
  const counts = shown?.copy.counts;
  const hovered = pointerHover ?? state.hover;
  const tabCounts: Record<ListView, number | undefined> = { ranked: counts?.ranked, queue: counts?.queue };
  // A tab with nothing in it cannot be chosen. The one showing stays enabled even when empty, as after a pasted link or
  // a rule switch that emptied it, so it can always be left.
  const tabOpen = (id: ListView) => ready && (tabCounts[id] !== 0 || state.view === id);
  // The ARIA tabs pattern: the shown tab is the one tab stop. The arrow keys, Home and End move between the tabs that
  // can be chosen and show the one they reach.
  const onTabKey = (event: ReactKeyboardEvent<HTMLElement>) => {
    const open = VIEWS.filter(tabOpen);
    const at = open.indexOf(state.view);
    if (at === -1) return;
    const step = TAB_STEP[event.key];
    const next =
      step !== undefined
        ? open[(at + step + open.length) % open.length]
        : event.key === "Home"
          ? open[0]
          : event.key === "End"
            ? open[open.length - 1]
            : undefined;
    if (next === undefined) return;
    event.preventDefault();
    if (next !== state.view) showTab(next);
    root.current?.querySelector<HTMLElement>(`#screening-tab-${next}`)?.focus();
  };
  const tab = (id: ListView, label: string, region?: string) => (
    <button
      type="button"
      role="tab"
      id={`screening-tab-${id}`}
      className={styles.tab}
      aria-selected={state.view === id}
      aria-controls="screening-list"
      tabIndex={state.view === id ? 0 : -1}
      data-region={region}
      disabled={!tabOpen(id)}
      onClick={() => showTab(id)}
    >
      {label}
      {ready && tabCounts[id] !== undefined ? (
        <span className={styles.tabCount}>({copy.formatCount(tabCounts[id])})</span>
      ) : null}
    </button>
  );

  const copyLink = (compact: boolean) => (
    <CopyLink copy={copy} disabled={!ready} onCopied={notify} compact={compact} />
  );

  return (
    <div
      ref={root}
      className={styles.root}
      data-testid="screening-workspace"
      data-layout={layout.mode}
      data-has-insp={cardOpen || undefined}
      data-card-docked={layout.docked || undefined}
      data-instant={keyboard || undefined}
      aria-label={copy.LAYOUT.workspaceAria}
      style={layout.band ? ({ "--band": `${layout.band}px` } as React.CSSProperties) : undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape" && state.school !== null) clearSelection();
      }}
    >
      <div className={styles.stage}>
        <ScreeningMap
          load={loadMap}
          schools={mapSchools}
          selectedKey={selectedKey}
          onSelect={select}
          padding={padding}
          stale={stale}
          onDrawn={store.markReady}
          hoverKey={state.hover}
          onHoverChange={setPointerHover}
          tipFor={tipFor}
          emphasis={state.view === "queue" ? "incomplete" : "all"}
          frame={frame}
          instant={keyboard}
          label={copy.LAYOUT.mapAria}
          attribution={copy.LAYOUT.attribution}
        />

        <Masthead copy={copy} className={styles.topBar} actions={copyLink(true)} />
        <div className={styles.actions}>{copyLink(false)}</div>

        {!cardOpen && ready ? (
          <p className={`${styles.panel} ${styles.slotHint}`} id="slot-hint" data-region="slot-hint">
            <MousePointerClick size={14} aria-hidden />
            <span>{state.view === "queue" ? copy.LAYOUT.rowHintQueue : copy.LAYOUT.workspaceHint}</span>
          </p>
        ) : null}

        <section
          className={`${styles.panel} ${styles.column}`}
          aria-label={copy.LAYOUT.productName}
          inert={layout.docked}
          data-aside={layout.docked || undefined}
        >
          <Masthead copy={copy} />

          {firstLoad ? (
            <p className={styles.state} role="status">
              {copy.LAYOUT.loading}
            </p>
          ) : (
            <>
              {data.rules ? (
                <RuleArea
                  copy={copy}
                  rules={data.rules}
                  requested={data.requested}
                  shown={shown?.rule ?? null}
                  statement={comparing ? null : data.statement}
                  comparing={comparing}
                  disabled={!ready}
                  layer={layer}
                  onRule={changeRule}
                  onSeeWithout={seeWithout}
                  onBack={backToMain}
                />
              ) : (
                <div className={styles.ruleSkeleton} aria-hidden />
              )}

              <div
                className={styles.tabs}
                role="tablist"
                aria-label={copy.LAYOUT.tabsAria}
                onKeyDown={onTabKey}
              >
                {tab("ranked", copy.LAYOUT.orderedTab)}
                {tab("queue", copy.LAYOUT.incompleteTab, "queue-tab")}
              </div>

              <div
                ref={list}
                id="screening-list"
                className={`${styles.listScroll} ${stale ? styles.stale : ""}`}
                role="tabpanel"
                aria-labelledby={`screening-tab-${state.view}`}
              >
                {data.empty || view.kind === "failed" ? (
                  <FullPanelState
                    copy={copy}
                    failure={data.empty ? null : view.kind === "failed" ? view.failure : null}
                    retrying={data.retrying}
                    retry={data.retry}
                  />
                ) : !ready || !shown ? (
                  <p className={styles.state} role="status">
                    {copy.LAYOUT.loading}
                  </p>
                ) : (
                  <>
                    {view.kind === "ready" && view.refreshFailed ? (
                      <p className={styles.refreshFailed} role="status" data-testid="refresh-failed">
                        {shown.copy.LAYOUT.refreshFailed}{" "}
                        <button type="button" className={styles.linkButton} onClick={data.retry}>
                          {copy.LAYOUT.retry}
                        </button>
                      </p>
                    ) : null}
                    {state.view === "ranked" ? (
                      <>
                        {comparing && data.comparison && data.comparison.status !== "loading" ? (
                          <WhatChanged
                            copy={shown.copy}
                            from={data.comparison.from}
                            to={data.comparison.to}
                            schools={shown.schools}
                            failed={
                              data.comparison.status === "failed" || data.comparison.status === "retrying"
                            }
                            retrying={data.comparison.status === "retrying"}
                            onRetry={data.comparison.retry}
                            onHide={hideComparison}
                            onBack={backFromComparison}
                          />
                        ) : null}
                        <header className={styles.listHead} data-region="scope">
                          <p className={styles.scopeLine}>
                            {shown.copy.scope(shown.rule).scopeShort}{" "}
                            <button
                              type="button"
                              className={styles.moreLink}
                              aria-expanded={scopeOpen}
                              aria-controls="screening-scope-detail"
                              onClick={() => store.setState({ scope: !state.scope })}
                            >
                              {scopeOpen ? shown.copy.HELP.readLess : shown.copy.HELP.readMore}
                            </button>
                          </p>
                          {scopeOpen ? (
                            <p className={styles.scopeDetail} id="screening-scope-detail">
                              {shown.copy.scope(shown.rule).scopeDetail}
                            </p>
                          ) : null}
                        </header>
                        <OrderedList
                          rows={ordered}
                          schools={schools}
                          copy={shown.copy}
                          rule={shown.rule}
                          upper={state.place === "upper"}
                          selected={selectedKey}
                          hovered={hovered}
                          onSelect={select}
                          busy={stale}
                          label={shown.copy.LAYOUT.orderedTab}
                        />
                      </>
                    ) : (
                      <>
                        <header className={styles.listHead}>
                          <h2 className={styles.queueTitle}>{shown.copy.TERMS.queue.label}</h2>
                          {/* The lead says none when there is no incomplete record; then there is nothing to group or
                              put in order. */}
                          <p className={styles.queueLead}>{shown.copy.IDEAS.queue.short}</p>
                          {incomplete.length > 0 ? (
                            <>
                              <div className={styles.groupBy} data-region="queue-missing">
                                <span id="screening-group-by">{shown.copy.LAYOUT.groupBy}</span>
                                <div
                                  className={styles.segmented}
                                  role="group"
                                  aria-labelledby="screening-group-by"
                                >
                                  <button
                                    type="button"
                                    aria-pressed={state.qgroup === "province"}
                                    onClick={() => groupBy("province")}
                                  >
                                    {shown.copy.LAYOUT.byProvince}
                                  </button>
                                  <button
                                    type="button"
                                    aria-pressed={state.qgroup === "evidence"}
                                    onClick={() => groupBy("evidence")}
                                  >
                                    {shown.copy.LAYOUT.missingFilters}
                                  </button>
                                </div>
                              </div>
                              {/* Each grouping has its own order sentence. */}
                              <p className={styles.scopeLine} data-region="queue-order">
                                {state.qgroup === "province"
                                  ? shown.copy.STRINGS.queueOrder
                                  : shown.copy.STRINGS.queueOrderMissing}
                              </p>
                            </>
                          ) : null}
                        </header>
                        <IncompleteList
                          rows={incomplete}
                          schools={schools}
                          copy={shown.copy}
                          grouping={state.qgroup}
                          selected={selectedKey}
                          hovered={hovered}
                          onSelect={select}
                          busy={stale}
                          label={shown.copy.LAYOUT.incompleteTab}
                        />
                      </>
                    )}
                    <p className={styles.listCaveat}>{copy.STRINGS.caveatPlain}</p>
                  </>
                )}
              </div>
            </>
          )}
        </section>

        <div className={styles.foot} data-stale={stale || undefined}>
          {ready ? (
            <Legend
              copy={copy}
              rule={shown?.rule ?? null}
              bands={bands}
              collapsed={layout.keyCollapsed}
              stacked={layout.keyStacked}
              stale={stale}
            />
          ) : null}
          <p className={styles.caveat} data-region="caveat">
            {copy.STRINGS.caveatPlain}
          </p>
        </div>

        {selectedSchool && shown ? (
          <SchoolCard
            key={shown.rule}
            copy={shown.copy}
            rule={shown.rule}
            listed={selectedSchool}
            schools={shown.schools}
            position={position}
            docked={layout.docked}
            stale={stale}
            onStep={step}
            onClose={clearSelection}
          />
        ) : null}
      </div>
      <div ref={setLayer} className={styles.layer} />
      <p className={styles.toast} role="status" aria-live="polite" data-on={toast ? "" : undefined}>
        {toast?.message}
      </p>
    </div>
  );
}

/** No schools, or a read that failed: one sentence and one way forward, in the list's place (R14). */
function FullPanelState({
  copy,
  failure,
  retrying,
  retry,
}: {
  copy: BoundCopy;
  failure: import("@/lib/screening/errors").Failure | null;
  retrying: boolean;
  retry: () => void;
}) {
  const { LAYOUT } = copy;
  if (failure === "session") {
    return (
      <div className={styles.fullState} role="alert" data-failure={failure}>
        <p>{LAYOUT.sessionEnded}</p>
        <a className={styles.linkButton} href="/sign-in?next=%2Fscreening">
          {LAYOUT.signIn}
        </a>
      </div>
    );
  }
  return (
    <div
      className={styles.fullState}
      role={failure ? "alert" : "status"}
      data-failure={failure ?? undefined}
      data-empty={failure ? undefined : ""}
    >
      <p>{failure ? LAYOUT.loadFailed : LAYOUT.emptyData}</p>
      <button type="button" className={styles.retryButton} onClick={retry} disabled={retrying}>
        {retrying ? LAYOUT.retrying : LAYOUT.retry}
      </button>
    </div>
  );
}
