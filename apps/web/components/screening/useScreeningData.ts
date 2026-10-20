"use client";

/**
 * The data boundary of the workspace. Every read of the screening API starts here, and the copy system is bound to
 * the loaded data here, once per rule shown, so nothing below this hook states a count it did not get from the data.
 *
 * Reads, all started together so none waits for another before the first list paints:
 *  - the rules;
 *  - the list of the rule asked for (speculatively the expected default, before the rules say otherwise);
 *  - the recorded comparison of the two main rules, which the statement under the switch reads.
 * Later reads follow the state: the list of the rule being compared with, and the comparison of another pair.
 */
import { useEffect, useMemo } from "react";

import {
  type BoundCopy,
  type CopyRuleId,
  type CopySchool,
  DEFAULT_RULE,
  PROPOSED_RULE,
  RULE_IDS,
  bindCopy,
  copyFor,
  isCopyRuleId,
} from "@/lib/screening/copy";
import { type ListView, listView } from "@/lib/screening/errors";
import {
  type RulePair,
  useScreeningCompare,
  useScreeningInputs,
  useScreeningResults,
  useScreeningRules,
} from "@/lib/screening/hooks";
import type { Placement, ResultsResponse, RuleId } from "@/lib/screening/types";
import { shownRule } from "@/lib/screening/workspace/state";

import { EXPECTED_DEFAULT_RULE, useUrlRead, useWorkspaceState, useWorkspaceStore } from "./WorkspaceProvider";

const MAIN_PAIR: RulePair = { a: DEFAULT_RULE as RuleId, b: PROPOSED_RULE as RuleId };

/** Two rules in the order the API's comparisons are asked for, so a pair is one cached read whichever way round. */
function canonicalPair(x: RuleId, y: RuleId): RulePair {
  const order = (id: RuleId) => RULE_IDS.indexOf(id as CopyRuleId);
  return order(x) <= order(y) ? { a: x, b: y } : { a: y, b: x };
}
const samePair = (p: RulePair, q: RulePair) => p.a === q.a && p.b === q.b;

/** A rule the API offers and the copy has words for. */
export interface RuleChoice {
  id: CopyRuleId;
  primary: boolean;
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
  comparison: Comparison | null;
  retry: () => void;
}

export function useScreeningData(): ScreeningData {
  const store = useWorkspaceStore();
  const state = useWorkspaceState();
  const urlRead = useUrlRead();

  const rules = useScreeningRules();
  const defaultRule = rules.data?.default_rule_id ?? EXPECTED_DEFAULT_RULE;
  const ruleIds = useMemo(
    () => (rules.data ? rules.data.rules.map((r) => r.rule_id).filter((id) => isCopyRuleId(id)) : null),
    [rules.data]
  );
  // The store checks rules against what the API offers, and resolves `rule: null` to the API's default.
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

  // The other lists the copy reads: both combined-factors rules (what each input adds, the persistence flag) and the
  // rule being compared with (a school's places under both). The shown rule's own list is `results`.
  const extra = (rule: RuleId | null) =>
    urlRead && rule !== null && rule !== requested ? { rule, placement } : null;
  const circulated = useScreeningResults(extra(MAIN_PAIR.a));
  const proposed = useScreeningResults(extra(MAIN_PAIR.b));
  const fromList = useScreeningResults(
    extra(from && from !== MAIN_PAIR.a && from !== MAIN_PAIR.b ? (from as RuleId) : null)
  );

  const schoolKeys = useMemo(
    () => (data ? new Set(data.rows.map((r) => r.school.school_key)) : null),
    [data]
  );
  useEffect(() => {
    if (schoolKeys) store.setKnown({ schoolKeys });
  }, [store, schoolKeys]);

  const pairCompare = pair ? (isMainPair ? mainCompare.data : otherCompare.data) : mainCompare.data;
  const others = [circulated.data, proposed.data, fromList.data];
  const shown = useMemo((): ShownList | null => {
    if (!data || !shownId || !inputs.data) return null;
    // A list kept while another loads is the previous rule's: only lists of their own rule count.
    const lists = [
      data,
      ...others.filter((l): l is ResultsResponse => !!l && l.run.rule_id !== data.run.rule_id),
    ];
    const unique = lists.filter((l, i) => lists.findIndex((m) => m.run.rule_id === l.run.rule_id) === i);
    const bound = bindCopy({ view: shownId, inputs: inputs.data, lists: unique, compare: pairCompare });
    return { rule: shownId, response: data, schools: bound.schools, copy: bound.copy };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `others` is rebuilt each render; its members are the key.
  }, [data, shownId, inputs.data, pairCompare, circulated.data, proposed.data, fromList.data]);

  const idleCopy = useMemo(() => copyFor({}), []);

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

  const rulesList = useMemo((): RuleChoice[] | null => {
    if (!rules.data) return null;
    const offered = new Map(rules.data.rules.map((r) => [r.rule_id as string, r]));
    return RULE_IDS.filter((id) => offered.has(id)).map((id) => ({
      id,
      primary: offered.get(id)!.policy_role === "primary",
    }));
  }, [rules.data]);

  return {
    view,
    stale: view.kind === "ready" && view.stale,
    requested: requested as CopyRuleId,
    rules: rulesList,
    shown,
    idleCopy,
    statementReady: !mainCompare.isPending,
    comparison,
    retry: () => {
      void rules.refetch();
      void results.refetch();
      void inputs.refetch();
      void mainCompare.refetch();
    },
  };
}
