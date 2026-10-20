"use client";

import { useEffect, useMemo, useState } from "react";

import { type ListTab, reconcileSelection, splitRows, tabOf } from "@/lib/screening/list";
import { useScreeningResults, useScreeningRules } from "@/lib/screening/hooks";
import { toMapSchools } from "@/lib/screening/marks";
import type { RuleId, SchoolKey } from "@/lib/screening/types";

import { COPY } from "./copy";
import { Legend } from "./Legend";
import { RuleSwitch } from "./RuleSwitch";
import { SchoolCard } from "./SchoolCard";
import { IncompleteList, OrderedList } from "./SchoolList";
import { ScreeningMap } from "./ScreeningMap";
import styles from "./screening.module.css";

/** Space the floating panels take on the map, so marks are framed and panned clear of them. */
const PANEL = { column: 16 + 416 + 40, card: 16 + 392 + 40 };

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={styles.error} role="alert">
      <p>{COPY.loadFailed}</p>
      <button type="button" className={styles.linkButton} onClick={onRetry}>
        {COPY.retry}
      </button>
    </div>
  );
}

export function ScreeningWorkspace() {
  const rules = useScreeningRules();
  const [chosenRule, setChosenRule] = useState<RuleId | null>(null);
  const ruleId = chosenRule ?? rules.data?.default_rule_id ?? null;
  const results = useScreeningResults(ruleId ? { rule: ruleId } : null);

  const rows = useMemo(() => results.data?.rows ?? [], [results.data]);
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

  const stale = results.isPlaceholderData;
  const activeRule = rules.data?.rules.find((rule) => rule.rule_id === ruleId);
  const padding = useMemo(
    () => ({ top: 80, bottom: 120, left: PANEL.column, right: selectedRow ? PANEL.card : 64 }),
    [selectedRow]
  );

  return (
    <div
      className={styles.root}
      data-testid="screening-workspace"
      onKeyDown={(event) => {
        if (event.key === "Escape" && pickedKey !== null) setPickedKey(null);
      }}
    >
      {/* Slot: the guide rail (questions, saved views). It takes no room until it has content. */}
      <aside className={styles.rail} data-slot="guide-rail" data-empty="true" aria-label="Guide" hidden />

      <div className={styles.stage}>
        <ScreeningMap schools={schools} selectedKey={selectedKey} onSelect={setPickedKey} padding={padding} />

        <section className={`${styles.panel} ${styles.column}`} aria-label={COPY.title}>
          <header className={styles.masthead}>
            <h1 className={styles.title}>{COPY.title}</h1>
          </header>

          {rules.data && ruleId ? (
            <RuleSwitch rules={rules.data.rules} active={ruleId} onChange={setChosenRule} />
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
              <span>{ordered.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              className={styles.tab}
              aria-selected={tab === "incomplete"}
              onClick={() => setTab("incomplete")}
            >
              {COPY.tabIncomplete}
              <span>{incomplete.length}</span>
            </button>
          </div>

          {rules.isError || results.isError ? (
            <LoadFailed
              onRetry={() => {
                void rules.refetch();
                void results.refetch();
              }}
            />
          ) : !results.data ? (
            <p className={styles.state} role="status">
              {COPY.loading}
            </p>
          ) : tab === "ordered" ? (
            <>
              <p className={styles.listIntro}>{COPY.listIntro}</p>
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
        </section>

        <Legend ruleLabel={activeRule?.label ?? ""} />

        {selectedRow ? <SchoolCard row={selectedRow} onClose={() => setPickedKey(null)} /> : null}

        {/* Slots: Explain this screen and the glossary (map bar), export actions, saved views. */}
      </div>
    </div>
  );
}
