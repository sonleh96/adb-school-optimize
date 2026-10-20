/**
 * The workspace's state: one typed record that the URL, the screen and the guide layers all read and write.
 *
 * Each key is one row of `KEYS`: how a value is read (from the URL or from a caller that may pass anything), what it
 * is when cleared, and how it is written back. `applyPatch` is the only way the state changes, so the rules that hold
 * across keys live in one place (`normalise`):
 *  - an invalid value is ignored and the key keeps its value; `null` clears it to its default;
 *  - the rule being compared with is never the rule being shown;
 *  - a value the loaded data does not know (a rule the API has no run for, a school not in the list) is invalid once
 *    the data is known, and accepted until then, so a pasted link survives the page's first render.
 */
import type { RuleId, SchoolKey } from "../types";

export type ListView = "ranked" | "queue";
export type QueueGrouping = "province" | "evidence";
export type Placement = "lower" | "upper";

export interface WorkspaceState {
  /** The rule whose list is shown. `null` is the API's default rule. */
  readonly rule: RuleId | null;
  /** The rule the list was switched from; What changed compares the two. `null` hides What changed. */
  readonly compare: RuleId | null;
  readonly school: SchoolKey | null;
  /** A school shown as if the pointer were on it. The guides use it to point at a school without opening it. */
  readonly hover: SchoolKey | null;
  readonly view: ListView;
  readonly qgroup: QueueGrouping;
  /** Where range schools sit: at the lower end of their scores (the study's main order) or the upper end. */
  readonly place: Placement;
  /** The scope detail under the scope line is open. */
  readonly scope: boolean;
}

export type StateKey = keyof WorkspaceState;

export const DEFAULT_STATE: WorkspaceState = Object.freeze({
  rule: null,
  compare: null,
  school: null,
  hover: null,
  view: "ranked",
  qgroup: "province",
  place: "lower",
  scope: false,
});

/** What the loaded data says is valid. `null` means not known yet, so any well-formed value is accepted. */
export interface Known {
  readonly ruleIds: ReadonlySet<string> | null;
  readonly defaultRule: RuleId;
  readonly schoolKeys: ReadonlySet<string> | null;
}

/** What a caller may pass for a key: its value, its URL text, or `null` to clear it. */
export type Patch = { readonly [K in StateKey]?: WorkspaceState[K] | string | boolean | null };

const INVALID = Symbol("invalid");
type Parsed<T> = T | typeof INVALID;

interface KeyDef<T> {
  /** `value` is whatever a caller passed, never `null` (which clears). */
  readonly parse: (value: unknown, known: Known) => Parsed<T>;
  /** The URL text, or `null` to leave the key out because it holds its default. */
  readonly write: (value: T) => string | null;
}

const oneOf =
  <T extends string>(...values: readonly T[]) =>
  (value: unknown): Parsed<T> =>
    typeof value === "string" && (values as readonly string[]).includes(value) ? (value as T) : INVALID;

const ruleKey: KeyDef<RuleId | null> = {
  parse: (value, known) => {
    if (typeof value !== "string" || value === "") return INVALID;
    if (known.ruleIds && !known.ruleIds.has(value)) return INVALID;
    return value as RuleId;
  },
  write: (value) => value,
};

const schoolKey: KeyDef<SchoolKey | null> = {
  parse: (value, known) => {
    if (typeof value !== "string" || value === "") return INVALID;
    if (known.schoolKeys && !known.schoolKeys.has(value)) return INVALID;
    return value as SchoolKey;
  },
  write: (value) => value,
};

const flag: KeyDef<boolean> = {
  parse: (value) =>
    value === true || value === "1" ? true : value === false || value === "0" ? false : INVALID,
  write: (value) => (value ? "1" : null),
};

const enumKey = <T extends string>(fallback: T, ...values: readonly T[]): KeyDef<T> => ({
  parse: oneOf(...values),
  write: (value) => (value === fallback ? null : value),
});

/** Every key, in the order the URL writes them. */
export const KEYS: { readonly [K in StateKey]: KeyDef<WorkspaceState[K]> } = {
  rule: ruleKey,
  compare: ruleKey,
  view: enumKey<ListView>("ranked", "ranked", "queue"),
  qgroup: enumKey<QueueGrouping>("province", "province", "evidence"),
  place: enumKey<Placement>("lower", "lower", "upper"),
  scope: flag,
  school: schoolKey,
  hover: schoolKey,
};

const STATE_KEYS = Object.keys(KEYS) as StateKey[];

/** The rules that hold across keys. Runs after every change, so no caller can leave the state inconsistent. */
function normalise(state: WorkspaceState, known: Known): WorkspaceState {
  let next = state;
  // The default rule is stored as null, so a link to the default list carries no rule at all.
  if (next.rule === known.defaultRule) next = { ...next, rule: null };
  const shown = next.rule ?? known.defaultRule;
  if (next.compare === shown) next = { ...next, compare: null };
  return next;
}

/** The state after `patch`. Keys not named keep their value; an invalid value is ignored; `null` clears. */
export function applyPatch(state: WorkspaceState, patch: Patch, known: Known): WorkspaceState {
  let next: WorkspaceState = state;
  for (const key of STATE_KEYS) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (value === undefined) continue;
    const def = KEYS[key] as KeyDef<WorkspaceState[typeof key]>;
    const parsed = value === null ? DEFAULT_STATE[key] : def.parse(value, known);
    if (parsed === INVALID) continue;
    if (next[key] !== parsed) next = { ...next, [key]: parsed };
  }
  next = normalise(next, known);
  return sameState(next, state) ? state : next;
}

/**
 * The state checked again once more of the data is known: a value accepted before the data loaded (a pasted link)
 * that the data does not hold falls back to its default.
 */
export function revalidate(state: WorkspaceState, known: Known): WorkspaceState {
  let next: WorkspaceState = state;
  for (const key of STATE_KEYS) {
    const value = state[key];
    if (value === DEFAULT_STATE[key]) continue;
    const def = KEYS[key] as KeyDef<WorkspaceState[typeof key]>;
    if (def.parse(value, known) === INVALID) next = { ...next, [key]: DEFAULT_STATE[key] };
  }
  next = normalise(next, known);
  return sameState(next, state) ? state : next;
}

export function sameState(a: WorkspaceState, b: WorkspaceState): boolean {
  return STATE_KEYS.every((key) => a[key] === b[key]);
}

/** The state a URL describes, starting from the defaults. Parameters that are not workspace keys are ignored. */
export function stateFromSearch(search: string, known: Known): WorkspaceState {
  const params = new URLSearchParams(search);
  const patch: Record<string, string> = {};
  for (const key of STATE_KEYS) {
    const value = params.get(key);
    if (value !== null) patch[key] = value;
  }
  return applyPatch(DEFAULT_STATE, patch, known);
}

/**
 * `search` with the workspace keys replaced by `state`'s, in a fixed order, and every other parameter kept as it
 * was, so a layer that owns its own keys (the guides, help mode) keeps them.
 */
export function searchWithState(search: string, state: WorkspaceState): string {
  const params = new URLSearchParams(search);
  for (const key of STATE_KEYS) params.delete(key);
  const own = new URLSearchParams();
  for (const key of STATE_KEYS) {
    const def = KEYS[key] as KeyDef<WorkspaceState[typeof key]>;
    const text = def.write(state[key]);
    if (text !== null) own.set(key, text);
  }
  for (const [key, value] of params) own.append(key, value);
  const query = own.toString();
  return query ? `?${query}` : "";
}

/** The rule on screen: the chosen one, or the API's default. */
export const shownRule = (state: WorkspaceState, known: Known): RuleId => state.rule ?? known.defaultRule;
