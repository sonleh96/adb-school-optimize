"use client";

/**
 * The data boundary of the workspace. Every read of the screening API starts here, and the copy system is bound to
 * the loaded data here, once per rule shown, so nothing below this hook states a count it did not get from the data.
 *
 * Reads, all started together so none waits for another before the first list paints:
 *  - the rules;
 *  - the list of the rule asked for (speculatively the expected default, before the rules say otherwise);
 *  - the recorded comparison of the main rule and the urgency sensitivity, which the statement under the switch reads.
 * Later reads follow the state: the list of the rule being compared with, and the comparison of another pair.
 */
import { useEffect, useMemo } from "react";

import {
  type BoundCopy,
  type CopyRuleId,
  type CopySchool,
  RULE_IDS,
  bindCopy,
  copyFor,
  isCopyRuleId,
  pairwiseFromCompare,
} from "@/lib/screening/copy";
import { type ListView, isEmptyStore, listView } from "@/lib/screening/errors";
import {
  type RulePair,
  useScreeningCompare,
  useScreeningInputs,
  useScreeningResults,
  useScreeningRules,
} from "@/lib/screening/hooks";
import { PRIMARY_RULE, RULE_PAIR, SENSITIVITY_RULE, inRulePair } from "@/lib/screening/rule-pair";
import type { Placement, ResultsResponse, RuleId } from "@/lib/screening/types";
import { shownRule } from "@/lib/screening/workspace/state";

import { EXPECTED_DEFAULT_RULE, useUrlRead, useWorkspaceState, useWorkspaceStore } from "./WorkspaceProvider";

/** Two rules in the order the API's comparisons are asked for, so a pair is one cached read whichever way round. */
export function canonicalPair(x: RuleId, y: RuleId): RulePair {
  const order = (id: RuleId) => RULE_IDS.indexOf(id as CopyRuleId);
  return order(x) <= order(y) ? { a: x, b: y } : { a: y, b: x };
}
const samePair = (p: RulePair, q: RulePair) => p.a === q.a && p.b === q.b;

/** The comparison of the main rule and the urgency sensitivity, asked for as every other pair is. */
export const MAIN_PAIR: RulePair = canonicalPair(PRIMARY_RULE as RuleId, SENSITIVITY_RULE as RuleId);

/** A rule the API offers and the copy has words for. */
export interface RuleChoice {
  id: CopyRuleId;
  /** One of the two rules of the switch: the main rule or the urgency sensitivity. */
  inPair: boolean;
}

/** The list on screen, with the copy bound to the run it came from. */
export interface ShownList {
  /** The rule of the rows on screen. While another rule loads, this is still the previous one. */
  rule: CopyRuleId;
  response: ResultsResponse;
  /** The schools of the list, in the API's order, as whole records with their results under every list loaded. */
  schools: readonly CopySchool[];
  copy: BoundCopy;
}

/**
 * The recorded comparison What changed reads. A request that failed is not a pair the study never recorded: the copy
 * says no comparison is recorded only for an answer that holds none, so a failure is told apart and can be retried.
 */
export interface Comparison {
  /** The rule the list was switched from, and the rule on screen. */
  from: CopyRuleId;
  to: CopyRuleId;
  /** `retrying` is a failed read being asked for again: it is still shown as failed, with its Retry. */
  status: "loading" | "ready" | "failed" | "retrying";
  retry: () => void;
}

export interface ScreeningData {
  view: ListView;
  /** The API holds no schools at all: one sentence and Retry, not a failure (R14). */
  empty: boolean;
  /** A Retry is under way. */
  retrying: boolean;
  /** The rows on screen belong to the previous rule while the next one loads. */
  stale: boolean;
  /** The rule asked for; the switch shows it at once. */
  requested: CopyRuleId;
  rules: RuleChoice[] | null;
  shown: ShownList | null;
  /** The copy with no data bound, for words that state no count, while nothing has loaded. */
  idleCopy: BoundCopy;
  /** The statement under the switch is ready to show: the main comparison has loaded or failed. */
  statementReady: boolean;
  /**
   * The statement under the switch, worded from the two main rules' comparison whatever pair What changed reads,
   * or null until the shown list and that comparison are in.
   */
  statement: string | null;
  comparison: Comparison | null;
  retry: () => void;
}

export function useScreeningData(): ScreeningData {
  const store = useWorkspaceStore();
  const state = useWorkspaceState();
  const urlRead = useUrlRead();

  const rules = useScreeningRules();
  // A link with no rule opens the web app's main rule, the one its words call the main rule, whatever rule the API
  // names as its own default. Only an API that does not offer the main rule falls back to its default.
  const defaultRule =
    rules.data && !rules.data.rules.some((r) => r.rule_id === PRIMARY_RULE)
      ? rules.data.default_rule_id
      : EXPECTED_DEFAULT_RULE;
  const ruleIds = useMemo(
    () => (rules.data ? rules.data.rules.map((r) => r.rule_id).filter((id) => isCopyRuleId(id)) : null),
    [rules.data]
  );
  // The store checks rules against what the API offers, and resolves `rule: null` to the default above.
  useEffect(() => {
    if (ruleIds) store.setKnown({ ruleIds: new Set(ruleIds), defaultRule });
  }, [store, ruleIds, defaultRule]);

  const requested = shownRule(state, { ...store.known(), defaultRule });
  const placement: Placement | undefined = state.place === "upper" ? "upper" : undefined;
  const results = useScreeningResults(urlRead ? { rule: requested, placement } : null);
  // Every school's stored inputs in one read: the rows' reasons and missing details need no request per school.
  const inputs = useScreeningInputs(urlRead);
  const mainCompare = useScreeningCompare(urlRead ? MAIN_PAIR : null);

  const data = results.data;
  const shownId = data && isCopyRuleId(data.run.rule_id) ? data.run.rule_id : null;
  const from =
    state.compare && isCopyRuleId(state.compare) && state.compare !== shownId ? state.compare : null;
  const pair = from && shownId ? canonicalPair(from as RuleId, shownId as RuleId) : null;
  const isMainPair = pair !== null && samePair(pair, MAIN_PAIR);
  const otherCompare = useScreeningCompare(pair && !isMainPair ? pair : null);

  // The other lists the copy reads: both combined-factors rules (what each input adds, each one's persistence flag)
  // and the rule being compared with (a school's places under both). The shown rule's own list is `results`.
  const extra = (rule: RuleId | null) =>
    // Asked for once the shown list is in: the first list never waits on them, and no data means no request.
    data && rule !== null && rule !== requested ? { rule, placement } : null;
  const mainList = useScreeningResults(extra(PRIMARY_RULE as RuleId));
  const urgencyList = useScreeningResults(extra(SENSITIVITY_RULE as RuleId));
  const fromList = useScreeningResults(extra(from && !inRulePair(from) ? (from as RuleId) : null));

  const schoolKeys = useMemo(
    () => (data ? new Set(data.rows.map((r) => r.school.school_key)) : null),
    [data]
  );
  useEffect(() => {
    if (schoolKeys) store.setKnown({ schoolKeys });
  }, [store, schoolKeys]);

  const pairCompare = pair ? (isMainPair ? mainCompare.data : otherCompare.data) : mainCompare.data;
  const ruleNames = state.analyst ? "lettered" : "plain";
  const others = [mainList.data, urgencyList.data, fromList.data];
  const shown = useMemo((): ShownList | null => {
    if (!data || !shownId || !inputs.data) return null;
    // A list kept while another loads is the previous rule's: only lists of their own rule count.
    const lists = [
      data,
      ...others.filter((l): l is ResultsResponse => !!l && l.run.rule_id !== data.run.rule_id),
    ];
    const unique = lists.filter((l, i) => lists.findIndex((m) => m.run.rule_id === l.run.rule_id) === i);
    // Plain words name each rule on the first screen; the method details keep the paper's letters (S0, S, ...).
    const bound = bindCopy({
      view: shownId,
      inputs: inputs.data,
      lists: unique,
      compare: pairCompare,
      ruleNames,
    });
    return { rule: shownId, response: data, schools: bound.schools, copy: bound.copy };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `others` is rebuilt each render; its members are the key.
  }, [data, shownId, inputs.data, pairCompare, mainList.data, urgencyList.data, fromList.data, ruleNames]);

  const idleCopy = useMemo(() => copyFor({ ruleNames }), [ruleNames]);

  const view = listView(
    { hasData: Boolean(rules.data), isPlaceholderData: false, error: rules.error },
    {
      hasData: Boolean(data && inputs.data),
      isPlaceholderData: results.isPlaceholderData,
      error: results.error ?? inputs.error,
    },
    // Until the rules name the default, a list asked for by default is a guess whose failure is not the page's.
    state.rule === null
  );

  const pairQuery = isMainPair ? mainCompare : otherCompare;
  // A read with no data goes back to pending while it is asked for again, so its earlier failure is read from the
  // count of errors it has had.
  const comparisonStatus: Comparison["status"] = pairQuery.data
    ? "ready"
    : pairQuery.isError
      ? "failed"
      : pairQuery.errorUpdateCount > 0
        ? "retrying"
        : "loading";
  const comparison: Comparison | null =
    from && shownId
      ? {
          from,
          to: shownId,
          status: comparisonStatus,
          retry: () => {
            void pairQuery.refetch();
          },
        }
      : null;

  // The statement is about the main rule and the urgency sensitivity, so it reads their comparison even while What
  // changed reads another.
  const statement = useMemo(
    () =>
      shown && !mainCompare.isPending
        ? shown.copy.defaultListStatement(
            mainCompare.data ? pairwiseFromCompare(mainCompare.data) : { pairwise: [] }
          )
        : null,
    [shown, mainCompare.isPending, mainCompare.data]
  );

  const rulesList = useMemo((): RuleChoice[] | null => {
    if (!rules.data) return null;
    const offered = new Map(rules.data.rules.map((r) => [r.rule_id as string, r]));
    // The pair first, main rule first, then the other rules in the API's order. The pair is not read from the API's
    // policy role, because the revised paper names the main rule alone as primary and the circulated rule is a
    // labelled urgency sensitivity.
    return [...RULE_PAIR, ...RULE_IDS.filter((id) => !inRulePair(id))]
      .filter((id) => offered.has(id))
      .map((id) => ({ id, inPair: inRulePair(id) }));
  }, [rules.data]);

  return {
    view,
    stale: view.kind === "ready" && view.stale,
    requested: requested as CopyRuleId,
    rules: rulesList,
    shown,
    idleCopy,
    // A failed read goes back to pending while What changed's Retry asks for it again; it has still settled, so the
    // column stays on screen.
    statementReady: !mainCompare.isPending || mainCompare.errorUpdateCount > 0,
    statement,
    empty:
      isEmptyStore(results.error) ||
      isEmptyStore(inputs.error) ||
      (data !== undefined && data.rows.length === 0),
    retrying: (rules.isFetching || results.isFetching) && view.kind !== "ready",
    comparison,
    retry: () => {
      void rules.refetch();
      void results.refetch();
      void inputs.refetch();
      void mainCompare.refetch();
    },
  };
}
