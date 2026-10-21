/**
 * The saved views as a file to hand to colleagues (`rise-png-saved-views-<date>.json`): one link per view, in order,
 * and the method record of every rule the views show, as the API writes it into the top list, so anyone can rebuild
 * each list (the program's decision for downloads: the file keeps the API's full record in both layers).
 */
import type { RecordLine } from "../method/top-csv";
import type { RuleId } from "../types";
import {
  KEYS,
  type Known,
  type StateKey,
  type TopLength,
  type WorkspaceState,
  searchWithState,
  shownRule,
  stateFromSearch,
} from "../workspace/state";

import type { SavedView } from "./views";

export interface PackItem {
  readonly name: string;
  readonly link: string;
}

/** The view's state as the workspace reads its link, so a junk key or an unknown school never reaches a link. */
export const stateOf = (view: Pick<SavedView, "q">, known: Known): WorkspaceState =>
  stateFromSearch(view.q, known);

/** The keys whose values the loaded data decides: a rule it has a run for, a school, a province or remoteness class. */
const DATA_KEYS = new Set<StateKey>(["rule", "compare", "school", "hover", "prov", "loc"]);

/**
 * The keys a view's stored state names that the loaded data no longer holds (a school since removed, a rule the API
 * has no run for), in the workspace's key order. Reading the view drops them silently; this says which.
 */
export function droppedKeys(q: string, known: Known): StateKey[] {
  const params = new URLSearchParams(q);
  const loose: Known = { ...known, ruleIds: null, schoolKeys: null, provinces: null, localities: null };
  return (Object.keys(KEYS) as StateKey[]).filter((key) => {
    const value = params.get(key);
    if (value === null || !DATA_KEYS.has(key)) return false;
    // A value the key can hold at all, that this data does not hold. Junk text is not "dropped by the data".
    const parse = KEYS[key].parse as (value: unknown, known: Known) => unknown;
    return typeof parse(value, known) === "symbol" && typeof parse(value, loose) !== "symbol";
  });
}

/**
 * How many schools each rule's list in the pack holds, whatever length the top list tab was left at. The record
 * states it, and each rule's own record in the file says the same.
 */
export const PACK_LENGTH: TopLength = 20;

/** The link that reopens a view: the page's address with the view's state and nothing else. */
export const linkOf = (page: string, state: WorkspaceState): string => `${page}${searchWithState("", state)}`;

/** The rules the views show, in the order they first appear: the list's rule, and in compare mode the other one. */
export function rulesUsed(states: readonly WorkspaceState[], known: Known): RuleId[] {
  const rules = states.flatMap((state) => {
    const shown = shownRule(state, known);
    return state.mode === "compare" && state.compare ? [shown, state.compare] : [shown];
  });
  return [...new Set(rules)];
}

/** The file's name, by the day it is downloaded on, in the person's own time zone. */
export function packFileName(now: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `rise-png-saved-views-${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}.json`;
}

/** Copy all links: each view's number and name, then its link. */
export const linksText = (items: readonly PackItem[]): string =>
  items.map((item, i) => `${i + 1}. ${item.name}\n${item.link}`).join("\n\n");

/** The file: the views in order, then each rule's method record line by line. */
export function packText(
  items: readonly PackItem[],
  records: readonly { readonly rule: RuleId; readonly record: readonly RecordLine[] }[]
): string {
  const file = {
    saved_views: items.map((item, i) => ({ order: i + 1, name: item.name, link: item.link })),
    method_record: Object.fromEntries(
      records.map(({ rule, record }) => [rule, record.map((line) => `${line.key}: ${line.value}`)])
    ),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}
