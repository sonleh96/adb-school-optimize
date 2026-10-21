"use client";

/**
 * The export sheet's Saved views for meetings tab: the views in order, Copy all links, and the download of the views
 * with their method record (`rise-png-saved-views-<date>.json`). The plain tab says it all in the copy system's words;
 * with the method details on it shows each rule's formula, shares and file fingerprints. The file itself keeps each
 * rule's full record as the API writes it into that rule's top list, in both layers, so anyone can rebuild the lists.
 */
import { useQueries } from "@tanstack/react-query";
import { Fragment, type ReactNode, useMemo } from "react";

import {
  type BoundCopy,
  type CopyRuleId,
  type CopySchool,
  type Segments,
  nameSegment,
} from "@/lib/screening/copy";
import type { Method } from "@/lib/screening/copy/method";
import { classifyFailure } from "@/lib/screening/errors";
import { fetchTopList, saveFile } from "@/lib/screening/method/export";
import { recordValue } from "@/lib/screening/method/top-csv";
import type { RuleId } from "@/lib/screening/types";
import {
  droppedKeys,
  linkOf,
  linksText,
  packFileName,
  packText,
  rulesUsed,
  stateOf,
} from "@/lib/screening/views/pack";
import { plainViewTitle, viewTitle } from "@/lib/screening/views/step";
import type { TopLength, WorkspaceState } from "@/lib/screening/workspace/state";

import { RuleSymbol } from "../RuleArea";
import { Sentence } from "../Sentence";
import { useWorkspaceStore } from "../WorkspaceProvider";
import exportStyles from "../export/export.module.css";
import { useLater } from "../guide/useLater";
import base from "../screening.module.css";
import { useSavedViews } from "./useSavedViews";
import styles from "./views.module.css";

export interface PackSheetInput {
  readonly copy: BoundCopy;
  /** The method details' words, when they are on. */
  readonly method: Method | null;
  readonly schools: ReadonlyMap<string, CopySchool>;
  /** The top list's length on screen, which each rule's record names. */
  readonly n: TopLength;
  /** The tab is showing: only then are the rules' records fetched. */
  readonly enabled: boolean;
  readonly onNotify: (message: string) => void;
}

export interface PackSheet {
  readonly title: string;
  readonly lede: string;
  readonly body: ReactNode;
  readonly foot: ReactNode;
}

const join = (parts: readonly (Segments | null)[]): Segments =>
  parts
    .filter((part): part is Segments => part !== null)
    .flatMap((part, i) => (i === 0 ? part : [" · ", ...part]));

export function usePackSheet(input: PackSheetInput): PackSheet {
  const { copy, method, enabled, onNotify } = input;
  const { TERMS, LAYOUT, STRINGS } = copy;
  const plain = method === null;
  const later = useLater(copy);
  const workspace = useWorkspaceStore();
  const list = useMemo(() => [...input.schools.values()], [input.schools]);
  const { views } = useSavedViews(copy, list);
  const known = workspace.known();
  const states = useMemo(() => (views ?? []).map((view) => stateOf(view, known)), [views, known]);
  const rules = useMemo(() => rulesUsed(states, known), [states, known]);
  // Each rule's method record is the one the API writes into its top list: the same file the top list tab reads.
  const records = useQueries({
    queries: rules.map((rule) => ({
      queryKey: ["screening", "export", "top", rule, input.n, null],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchTopList(rule, input.n, null, signal),
      enabled,
      retry: (failures: number, error: Error) =>
        failures < 1 && ["server", "network"].includes(classifyFailure(error)),
      staleTime: Infinity,
    })),
  });
  const loaded = records.every((record) => record.data);
  const failed = records.some((record) => record.isError);

  const ready = later.status === "ready" && views !== null;
  const titles = ready ? views.map((view) => viewTitle(later.copy, view)) : [];
  const page = typeof window === "undefined" ? "" : `${window.location.origin}${window.location.pathname}`;
  const items = ready
    ? views.map((view, i) => ({ name: plainViewTitle(later.copy, view), link: linkOf(page, states[i]) }))
    : [];
  const ruleOf = (state: WorkspaceState) => (state.rule ?? known.defaultRule) as CopyRuleId;
  const schoolName = (state: WorkspaceState): Segments | null => {
    const school = state.school ? input.schools.get(state.school) : undefined;
    return school ? [nameSegment(copy.distinctName(school))] : null;
  };

  const copyLinks = async () => {
    try {
      await navigator.clipboard.writeText(linksText(items));
      onNotify(LAYOUT.linksCopied);
    } catch {
      onNotify(LAYOUT.copyNotDone);
    }
  };
  const download = () => {
    if (!loaded || items.length === 0) return;
    const text = packText(
      items,
      rules.map((rule, i) => ({ rule, record: records[i].data!.file.record }))
    );
    saveFile(text, packFileName(new Date()), "application/json");
    onNotify(LAYOUT.afterDownloadPack);
  };
  const retry = () => {
    for (const record of records) if (record.isError) void record.refetch();
  };

  const files = records.flatMap((record) => record.data?.file.record ?? []);
  const fingerprints = [
    ...new Map(files.filter((line) => line.key.endsWith("_sha256")).map((line) => [line.key, line])).values(),
  ];
  const bare = (label: string) => label.replace(/\s*\(\d+\)$/, "");
  const firstRule = (rules[0] ?? known.defaultRule) as CopyRuleId;

  const plainList = (
    <ol className={styles.packList} data-region="pack-table" aria-busy={!ready}>
      {ready
        ? views.map((view, i) => (
            <li
              key={`${view.at}:${view.seed ?? view.name}`}
              data-dropped={droppedKeys(view.q, known).join(" ") || undefined}
            >
              <span className={styles.packN}>{i + 1}.</span>
              <span className={styles.packName} dir="auto">
                <Sentence segments={titles[i]} />
              </span>
              <span className={styles.packWhat}>
                <Sentence
                  segments={join([
                    [copy.ruleLabel(ruleOf(states[i]))],
                    states[i].view === "queue" ? [LAYOUT.incompleteTab] : null,
                    schoolName(states[i]),
                  ])}
                />
              </span>
            </li>
          ))
        : null}
    </ol>
  );

  const methodTable = method ? (
    <table className={styles.packTable} data-region="pack-table" aria-busy={!ready}>
      <colgroup>
        <col />
        <col className={styles.colRule} />
        <col />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">{method.sheet.stop}</th>
          <th scope="col">{TERMS.rule.label}</th>
          <th scope="col">{method.sheet.shows}</th>
        </tr>
      </thead>
      <tbody>
        {ready
          ? views.map((view, i) => {
              const state = states[i];
              const short = (id: RuleId | null) =>
                copy.ruleShortName((id ?? known.defaultRule) as CopyRuleId);
              const onMethod = state.analyst ? [method.sheet.showsMethod] : null;
              const shows =
                state.mode === "compare" && state.compare
                  ? join([
                      [method.sheet.showsCompare(short(state.compare), short(state.rule))],
                      onMethod,
                      schoolName(state),
                    ])
                  : join([
                      [
                        state.view === "queue"
                          ? method.sheet.showsQueue(state.qgroup)
                          : method.sheet.showsRanked,
                      ],
                      state.compare ? [method.sheet.comparedWith(short(state.compare))] : null,
                      onMethod,
                      schoolName(state),
                    ]);
              return (
                <tr key={`${view.at}:${view.seed ?? view.name}`}>
                  <td dir="auto">
                    <Sentence segments={titles[i]} />
                  </td>
                  <td>{short(state.rule)}</td>
                  <td className={exportStyles.quiet}>
                    <Sentence segments={shows} />
                  </td>
                </tr>
              );
            })
          : null}
      </tbody>
    </table>
  ) : null;

  const shared = (
    <>
      <dt>{plain ? TERMS.rank.label : method.sheet.pointRanks}</dt>
      <dd>{copy.groupsSentence(firstRule)}</dd>
      <dt>{bare(TERMS.queue.label)}</dt>
      <dd>{STRINGS.queueIntro}</dd>
      <dt>{TERMS.tie_rule.label}</dt>
      <dd>{TERMS.tie_rule.line}</dd>
      {plain ? null : (
        <>
          <dt>{method.sheet.normalization}</dt>
          <dd>{method.sheet.normalizationV(copy.counts.all)}</dd>
        </>
      )}
      <dt>{TERMS.source.label}</dt>
      <dd>{STRINGS.source}</dd>
    </>
  );

  const technical = method
    ? rules.map((rule, i) => {
        const file = records[i]?.data?.file ?? null;
        const id = rule as CopyRuleId;
        return (
          <Fragment key={rule}>
            <dt>{TERMS.rule.label}</dt>
            <dd>
              <RuleSymbol symbol={copy.ruleSymbol(id)} className={exportStyles.sym} />
              {copy.ruleLabel(id)}
              <span className={exportStyles.mono}> {rule}</span>
            </dd>
            <dt>{method.sheet.formula}</dt>
            <dd className={exportStyles.mono}>{file ? recordValue(file, "formula") : ""}</dd>
            <dt>{method.sheet.weights}</dt>
            <dd>{file ? (recordValue(file, "weights") ?? method.sheet.noWeights) : ""}</dd>
            <dt>{method.sheet.urgency}</dt>
            <dd>{copy.urgencyNote(id)}</dd>
          </Fragment>
        );
      })
    : null;

  const record = (
    <section
      className={exportStyles.sec}
      data-region="pack-record"
      aria-label={TERMS.manifest.label}
      aria-busy={!loaded}
    >
      <p className={base.eyebrow}>{TERMS.manifest.label}</p>
      <p className={exportStyles.note}>{TERMS.manifest.line}</p>
      <dl className={exportStyles.dl}>
        <dt>{LAYOUT.rulesInPack}</dt>
        <dd>
          {rules.map((rule) => (
            <span key={rule} className={styles.ruleLine}>
              {copy.ruleLabel(rule as CopyRuleId)}. {copy.ruleRoleLine(rule as CopyRuleId)}.
            </span>
          ))}
        </dd>
        <dt>{LAYOUT.sharedRecord}</dt>
        <dd>{TERMS.manifest.help}</dd>
        {technical}
        {shared}
      </dl>
      {failed ? (
        <div className={base.fullState} role="alert">
          <p>{LAYOUT.loadFailed}</p>
          <button type="button" className={base.retryButton} onClick={retry}>
            {LAYOUT.retry}
          </button>
        </div>
      ) : !loaded ? null : plain ? (
        <p className={exportStyles.note}>{LAYOUT.fingerprints(fingerprints.length)}</p>
      ) : (
        <ul className={exportStyles.hashes}>
          {fingerprints.map((line) => (
            <li key={line.key} title={`${line.key} ${line.value}`}>
              <span>{line.key}</span>
              <span
                className={exportStyles.mono}
              >{`${line.value.slice(0, 12)}…${line.value.slice(-4)}`}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const body = (
    <>
      <section className={exportStyles.sec}>
        <p className={base.eyebrow}>{method ? method.sheet.viewsH : TERMS.briefing_stops.label}</p>
        {ready && views.length === 0 ? (
          <p className={exportStyles.note} data-region="no-views">
            {LAYOUT.noViews}
          </p>
        ) : method ? (
          methodTable
        ) : (
          plainList
        )}
      </section>
      {method ? (
        <section className={exportStyles.sec}>
          <p className={base.eyebrow}>{method.sheet.contents}</p>
          <dl className={exportStyles.dl}>
            <dt>{method.sheet.links}</dt>
            <dd>{method.sheet.linksV}</dd>
          </dl>
        </section>
      ) : null}
      {views && views.length > 0 ? record : null}
      {method ? (
        <section className={exportStyles.sec}>
          <p className={base.eyebrow}>{method.sheet.limits}</p>
          <p className={exportStyles.limits}>{method.sheet.limitsV}</p>
        </section>
      ) : (
        <p className={exportStyles.close}>{STRINGS.caveat}</p>
      )}
    </>
  );

  const foot = (
    <>
      <button
        type="button"
        className={exportStyles.quietButton}
        disabled={items.length === 0}
        onClick={() => void copyLinks()}
      >
        {LAYOUT.copyAllLinks}
      </button>
      <span className={exportStyles.spacer} />
      <button
        type="button"
        className={exportStyles.primary}
        disabled={!loaded || items.length === 0}
        onClick={download}
      >
        {LAYOUT.downloadPack}
      </button>
    </>
  );

  return {
    title: TERMS.briefing_stops.label,
    lede: method ? method.sheet.savedViewsLede : `${TERMS.briefing_stops.line} ${TERMS.briefing_stops.help}`,
    body,
    foot,
  };
}
