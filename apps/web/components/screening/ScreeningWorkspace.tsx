"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { listView } from "@/lib/screening/errors";
import { useAfterPaint, useScreeningResults, useScreeningRules } from "@/lib/screening/hooks";
import { type ListTab, reconcileSelection, splitRows, tabOf } from "@/lib/screening/list";
import { toMapSchools } from "@/lib/screening/marks";
import { RuleId, type SchoolKey } from "@/lib/screening/types";

import { COPY } from "./copy";
import { Legend } from "./Legend";
import { RuleSwitch } from "./RuleSwitch";
import { SchoolCard } from "./SchoolCard";
import { IncompleteList, OrderedList } from "./SchoolList";
import { ScreeningMap } from "./ScreeningMap";
import styles from "./screening.module.css";

/**
 * The rule the API lists first. Its list is asked for at the same time as the rules, so the first list does not
 * wait a round trip for them. If the API's default turns out to be another rule, the rules say so and that one
 * is asked for instead.
 */
const EXPECTED_DEFAULT_RULE = RuleId.parse("additive_u", "expected default rule");

/** Space the floating panels take on the map, so marks are framed and panned clear of them. */
const PANEL = { column: 16 + 416 + 40, card: 16 + 392 + 40 };

export function ScreeningWorkspace() {
  const root = useRef<HTMLDivElement>(null);
  const rules = useScreeningRules();
  const [chosenRule, setChosenRule] = useState<RuleId | null>(null);
  // The rule asked for. What is on screen is named by the data it came from, below, never by this.
  const requestedRule = chosenRule ?? rules.data?.default_rule_id ?? EXPECTED_DEFAULT_RULE;
  const results = useScreeningResults({ rule: requestedRule });

  const data = results.data;
  const view = listView(
    { hasData: Boolean(rules.data), isPlaceholderData: false, error: rules.error },
    { hasData: Boolean(data), isPlaceholderData: results.isPlaceholderData, error: results.error },
    chosenRule === null
  );
  // While a new rule loads, the previous rule's rows stay on screen. Everything that shows them says so together.
  const stale = view.kind === "ready" && view.stale;
  // The map's script is fetched once the list (or its failure) has been painted.
  const loadMap = useAfterPaint(view.kind !== "loading");
  const shownRuleLabel = data?.manifest.rule_label ?? "";

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const { ordered, incomplete } = useMemo(() => splitRows(rows), [rows]);
  const schools = useMemo(() => toMapSchools(rows), [rows]);

  const [pickedKey, setPickedKey] = useState<SchoolKey | null>(null);
  const [tab, setTab] = useState<ListTab>("ordered");

  // One selection serves the list, the map and the card. A school the current rows do not hold is no selection.
  const selectedKey = reconcileSelection(pickedKey, rows);
  const selectedRow = useMemo(
    () => (selectedKey ? (rows.find((row) => row.school.school_key === selectedKey) ?? null) : null),
    [rows, selectedKey]
  );

  // The list follows the selection: a school picked on the map, or one that another rule moves between the
  // ordered list and the incomplete records, is shown on the tab that holds it.
  const selectedTab = selectedRow ? tabOf(selectedRow) : null;
  useEffect(() => {
    if (selectedTab) setTab(selectedTab);
  }, [selectedTab, selectedKey]);

  // Closing the card or pressing Escape hands focus back to the school's row, so a keyboard user is not dropped.
  const clearSelection = useCallback(() => {
    const key = selectedKey;
    setPickedKey(null);
    if (!key) return;
    requestAnimationFrame(() => {
      root.current?.querySelector<HTMLElement>(`[data-school-key="${CSS.escape(key)}"]`)?.focus();
    });
  }, [selectedKey]);

  const padding = useMemo(
    () => ({ top: 80, bottom: 120, left: PANEL.column, right: selectedRow ? PANEL.card : 64 }),
    [selectedRow]
  );

  const retry = () => {
    void rules.refetch();
    void results.refetch();
  };

  return (
    <div
      ref={root}
      className={styles.root}
      data-testid="screening-workspace"
      onKeyDown={(event) => {
        if (event.key === "Escape" && pickedKey !== null) clearSelection();
      }}
    >
      {/* Slot: the guide rail (questions, saved views). It takes no room until it has content. */}
      <aside
        className={styles.rail}
        data-slot="guide-rail"
        data-empty="true"
        aria-label={COPY.guideLabel}
        hidden
      />

      <div className={styles.stage}>
        <ScreeningMap
          load={loadMap}
          schools={schools}
          selectedKey={selectedKey}
          onSelect={setPickedKey}
          padding={padding}
          stale={stale}
        />

        <section className={`${styles.panel} ${styles.column}`} aria-label={COPY.title}>
          <header className={styles.masthead}>
            <h1 className={styles.title}>{COPY.title}</h1>
          </header>

          {rules.data ? (
            <RuleSwitch rules={rules.data.rules} active={requestedRule} onChange={setChosenRule} />
          ) : null}

          <div className={styles.tabs} role="tablist">
            <button
              type="button"
              role="tab"
              className={styles.tab}
              aria-selected={tab === "ordered"}
              onClick={() => setTab("ordered")}
            >
              {COPY.tabOrdered}
              {data ? <span>{ordered.length}</span> : null}
            </button>
            <button
              type="button"
              role="tab"
              className={styles.tab}
              aria-selected={tab === "incomplete"}
              onClick={() => setTab("incomplete")}
            >
              {COPY.tabIncomplete}
              {data ? <span>{incomplete.length}</span> : null}
            </button>
          </div>

          {view.kind === "failed" ? (
            <div className={styles.error} role="alert" data-failure={view.failure}>
              <p>{COPY.failure[view.failure]}</p>
              {view.failure === "session" ? (
                <a className={styles.linkButton} href="/sign-in?next=%2Fscreening">
                  {COPY.signIn}
                </a>
              ) : (
                <button type="button" className={styles.linkButton} onClick={retry}>
                  {COPY.retry}
                </button>
              )}
            </div>
          ) : view.kind === "loading" || !data ? (
            <p className={styles.state} role="status">
              {COPY.loading}
            </p>
          ) : (
            <>
              {view.refreshFailed ? (
                <p className={styles.listIntro} role="status" data-testid="refresh-failed">
                  {COPY.refreshFailed}{" "}
                  <button type="button" className={styles.linkButton} onClick={retry}>
                    {COPY.retry}
                  </button>
                </p>
              ) : null}
              {tab === "ordered" ? (
                <>
                  <p className={styles.listIntro}>
                    {COPY.listIntro}
                    <span className={styles.scopeLine} data-testid="list-scopes">
                      {COPY.listScopes(data.manifest.point_rank_scope, data.manifest.rank_bounds_scope)}
                    </span>
                  </p>
                  <OrderedList
                    rows={ordered}
                    selected={selectedKey}
                    onSelect={setPickedKey}
                    busy={stale}
                    label={COPY.tabOrdered}
                  />
                </>
              ) : (
                <>
                  <p className={styles.listIntro}>{COPY.incompleteIntro}</p>
                  <IncompleteList
                    rows={incomplete}
                    selected={selectedKey}
                    onSelect={setPickedKey}
                    busy={stale}
                    label={COPY.tabIncomplete}
                  />
                </>
              )}
            </>
          )}
        </section>

        <Legend ruleLabel={shownRuleLabel} stale={stale} />

        {selectedRow ? (
          <SchoolCard row={selectedRow} ruleLabel={shownRuleLabel} stale={stale} onClose={clearSelection} />
        ) : null}

        {/* Slots: Explain this screen and the glossary (map bar), export actions, saved views. */}
      </div>
    </div>
  );
}
