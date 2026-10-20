"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { type CopyRuleId, DEFAULT_RULE, PROPOSED_RULE } from "@/lib/screening/copy";
import { useAfterPaint } from "@/lib/screening/hooks";
import { reconcileSelection, splitRows, tabOf } from "@/lib/screening/list";
import { toMapSchools } from "@/lib/screening/marks";
import type { SchoolKey } from "@/lib/screening/types";
import { scopesMix } from "@/lib/screening/workspace/rows";
import type { ListView } from "@/lib/screening/workspace/state";

import { COPY } from "./copy";
import { Legend } from "./Legend";
import { RuleArea } from "./RuleArea";
import { SchoolCard } from "./SchoolCard";
import { IncompleteList, OrderedList } from "./SchoolList";
import { ScreeningMap } from "./ScreeningMap";
import { useScreeningData } from "./useScreeningData";
import { WhatChanged } from "./WhatChanged";
import { WorkspaceProvider, useWorkspaceState, useWorkspaceStore } from "./WorkspaceProvider";
import styles from "./screening.module.css";

/** Space the floating panels take on the map, so marks are framed and panned clear of them. */
const PANEL = { column: 16 + 416 + 40, card: 16 + 392 + 40 };

export function ScreeningWorkspace() {
  return (
    <WorkspaceProvider>
      <Workspace />
    </WorkspaceProvider>
  );
}

function Masthead() {
  return (
    <header className={styles.masthead}>
      <svg className={styles.logo} viewBox="0 0 108 108" role="img" aria-label={COPY.mast.logo}>
        <rect width="108" height="108" fill="#0a2e73" />
        <text x="54" y="68" fill="#fff" fontSize="48" textAnchor="middle">
          ADB
        </text>
      </svg>
      <h1 className={styles.mastName}>{COPY.mast.name}</h1>
      <p className={styles.mastSub}>{COPY.mast.sub}</p>
    </header>
  );
}

function Workspace() {
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const store = useWorkspaceStore();
  const state = useWorkspaceState();
  const data = useScreeningData();
  const { view, stale, shown } = data;
  const copy = shown?.copy ?? data.idleCopy;
  const ready = view.kind === "ready" && shown !== null;

  // The map's script is fetched once the list (or its failure) has been painted.
  const loadMap = useAfterPaint(view.kind !== "loading");

  const rows = useMemo(() => shown?.response.rows ?? [], [shown]);
  const { ordered, incomplete } = useMemo(() => splitRows(rows), [rows]);
  const schools = useMemo(() => new Map((shown?.schools ?? []).map((s) => [s.id, s])), [shown]);
  const mapSchools = useMemo(() => toMapSchools(rows), [rows]);

  // One selection serves the list, the map and the card. A school the current rows do not hold is no selection.
  const selectedKey = reconcileSelection(state.school, rows);
  const selectedRow = useMemo(
    () => (selectedKey ? (rows.find((row) => row.school.school_key === selectedKey) ?? null) : null),
    [rows, selectedKey]
  );

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

  const showTab = (next: ListView) => {
    // A school the other tab does not hold stops being the selection.
    const keep = selectedTab === null || selectedTab === next;
    store.setState({ view: next, ...(keep ? {} : { school: null }) });
    list.current?.scrollTo({ top: 0 });
  };
  const changeRule = (rule: CopyRuleId) => {
    if (rule === data.requested) return;
    store.setState({ rule, compare: data.requested });
  };
  const seeWithout = () => {
    store.setState({ rule: PROPOSED_RULE, compare: DEFAULT_RULE, view: "ranked" });
    list.current?.scrollTo({ top: 0 });
  };
  const backToMain = () => store.setState({ rule: null, compare: null });

  const padding = useMemo(
    () => ({ top: 80, bottom: 120, left: PANEL.column, right: selectedRow ? PANEL.card : 64 }),
    [selectedRow]
  );

  const comparing = data.comparison !== null && state.view === "ranked";
  const mixed = scopesMix(ordered);
  const scopeOpen = state.scope || mixed;
  const counts = shown?.copy.counts;
  const tab = (id: ListView, label: string, count: number | undefined, region?: string) => (
    <button
      type="button"
      role="tab"
      id={`screening-tab-${id}`}
      className={styles.tab}
      aria-selected={state.view === id}
      aria-controls="screening-list"
      data-region={region}
      disabled={!ready}
      onClick={() => showTab(id)}
    >
      {label}
      {ready && count !== undefined ? (
        <span className={styles.tabCount}>({copy.formatCount(count)})</span>
      ) : null}
    </button>
  );

  return (
    <div
      ref={root}
      className={styles.root}
      data-testid="screening-workspace"
      data-has-insp={selectedRow ? "" : undefined}
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
        />

        <section className={`${styles.panel} ${styles.column}`} aria-label={COPY.mast.name}>
          <Masthead />

          {data.rules ? (
            <RuleArea
              copy={copy}
              rules={data.rules}
              requested={data.requested}
              shown={shown?.rule ?? null}
              statement={data.statementReady && !comparing}
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

          <div className={styles.tabs} role="tablist">
            {tab("ranked", copy.LAYOUT.orderedTab, counts?.ranked)}
            {tab("queue", copy.LAYOUT.incompleteTab, counts?.queue, "queue-tab")}
          </div>

          <div
            ref={list}
            id="screening-list"
            className={`${styles.listScroll} ${stale ? styles.stale : ""}`}
            role="tabpanel"
            aria-labelledby={`screening-tab-${state.view}`}
          >
            {view.kind === "failed" ? (
              <div className={styles.error} role="alert" data-failure={view.failure}>
                <p>{COPY.failure[view.failure]}</p>
                {view.failure === "session" ? (
                  <a className={styles.linkButton} href="/sign-in?next=%2Fscreening">
                    {COPY.signIn}
                  </a>
                ) : (
                  <button type="button" className={styles.linkButton} onClick={data.retry}>
                    {COPY.retry}
                  </button>
                )}
              </div>
            ) : !ready || !shown ? (
              <p className={styles.state} role="status">
                {COPY.loading}
              </p>
            ) : (
              <>
                {view.kind === "ready" && view.refreshFailed ? (
                  <p className={styles.refreshFailed} role="status" data-testid="refresh-failed">
                    {COPY.refreshFailed}{" "}
                    <button type="button" className={styles.linkButton} onClick={data.retry}>
                      {COPY.retry}
                    </button>
                  </p>
                ) : null}
                {state.view === "ranked" ? (
                  <>
                    {comparing && data.comparison?.settled ? (
                      <WhatChanged
                        copy={shown.copy}
                        from={data.comparison.from}
                        to={data.comparison.to}
                        schools={shown.schools}
                        onHide={() => store.setState({ compare: null })}
                        onBack={backToMain}
                      />
                    ) : null}
                    <header className={styles.listHead} data-region="scope">
                      <p className={styles.scopeLine}>
                        {shown.copy.scope(shown.rule).scopeShort}
                        {mixed ? null : (
                          <>
                            {" "}
                            <button
                              type="button"
                              className={styles.moreLink}
                              aria-expanded={scopeOpen}
                              aria-controls="screening-scope-detail"
                              onClick={() => store.setState({ scope: !state.scope })}
                            >
                              {scopeOpen ? shown.copy.HELP.readLess : shown.copy.HELP.readMore}
                            </button>
                          </>
                        )}
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
                      hovered={state.hover}
                      onSelect={select}
                      busy={stale}
                      label={shown.copy.LAYOUT.orderedTab}
                    />
                  </>
                ) : (
                  <>
                    <header className={styles.listHead}>
                      <h2 className={styles.queueTitle}>{shown.copy.TERMS.queue.label}</h2>
                      <p className={styles.queueLead}>{shown.copy.IDEAS.queue.short}</p>
                      <p className={styles.scopeLine}>{shown.copy.STRINGS.queueOrder}</p>
                    </header>
                    <IncompleteList
                      rows={incomplete}
                      schools={schools}
                      copy={shown.copy}
                      selected={selectedKey}
                      hovered={state.hover}
                      onSelect={select}
                      busy={stale}
                      label={shown.copy.LAYOUT.incompleteTab}
                    />
                  </>
                )}
              </>
            )}
          </div>
        </section>

        <Legend ruleLabel={shown?.response.manifest.rule_label ?? ""} stale={stale} />

        {selectedRow ? (
          <SchoolCard
            row={selectedRow}
            ruleLabel={shown?.response.manifest.rule_label ?? ""}
            stale={stale}
            onClose={clearSelection}
          />
        ) : null}
      </div>
      <div ref={setLayer} className={styles.layer} />
    </div>
  );
}
