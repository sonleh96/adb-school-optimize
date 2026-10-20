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
/** Compare mode puts the rule compared with (`compare`) and the rule shown (`rule`) side by side; it is method detail. */
export type Mode = "screen" | "compare";
/** The method details' popovers. Only one is open at a time, and none is written to the URL. */
export type Pop = "layers" | "filter" | "pickA" | "pickB" | "rules";
/** The map layers the method details can hide. */
export type MapLayer = "ranked" | "numerals" | "range" | "queue" | "provinces" | "districts";
export const MAP_LAYERS: readonly MapLayer[] = [
  "ranked",
  "numerals",
  "range",
  "queue",
  "provinces",
  "districts",
];
/** How many schools the top list holds. */
export type TopLength = 10 | 20 | 30;
/** How many places at the top of the compare chart are drawn in full. */
export type FullRows = 10 | 20;

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

  // The method details ("Show method details") and what only they show.
  readonly analyst: boolean;
  /** In compare mode `rule` is the rule compared and `compare` the reference; `a` and `b` in a patch name them. */
  readonly mode: Mode;
  readonly k: FullRows;
  /** The export sheet is open. */
  readonly panel: "export" | null;
  readonly n: TopLength;
  /** The method details' filters: they hide rows and dim marks, and never renumber a place. */
  readonly prov: string | null;
  readonly loc: string | null;
  readonly formula: boolean;
  /** The parts of school need are open in the card's numbers. */
  readonly parts: boolean;
  /** Map layers turned off, in `MAP_LAYERS` order. */
  readonly hide: readonly MapLayer[];
  readonly pop: Pop | null;
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
  analyst: false,
  mode: "screen",
  k: 20,
  panel: null,
  n: 20,
  prov: null,
  loc: null,
  formula: false,
  parts: false,
  hide: Object.freeze([]) as readonly MapLayer[],
  pop: null,
});

/** What the loaded data says is valid. `null` means not known yet, so any well-formed value is accepted. */
export interface Known {
  readonly ruleIds: ReadonlySet<string> | null;
  readonly defaultRule: RuleId;
  readonly schoolKeys: ReadonlySet<string> | null;
  /** The provinces and remoteness classes the list holds, for the filters. */
  readonly provinces?: ReadonlySet<string> | null;
  readonly localities?: ReadonlySet<string> | null;
}

/**
 * What a caller may pass for a key: its value, its URL text, or `null` to clear it. In compare mode `a` (the rule
 * compared with) and `b` (the rule compared) are other names for `compare` and `rule`, as the guide contract calls them.
 */
export type Patch = { readonly [K in StateKey]?: WorkspaceState[K] | string | boolean | number | null } & {
  readonly a?: string | null;
  readonly b?: string | null;
};

const INVALID = Symbol("invalid");
type Parsed<T> = T | typeof INVALID;

interface KeyDef<T> {
  /** `value` is whatever a caller passed, never `null` (which clears). */
  readonly parse: (value: unknown, known: Known) => Parsed<T>;
  /** The URL text, or `null` to leave the key out because it holds its default. */
  readonly write: (value: T) => string | null;
  /** Whether two values are the same; `Object.is` unless the value is a list. */
  readonly same?: (a: T, b: T) => boolean;
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

/** A number from a set, given as a number or as its URL text. */
const lengthKey = <T extends number>(fallback: T, ...values: readonly T[]): KeyDef<T> => ({
  parse: (value) => {
    const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
    return typeof n === "number" && (values as readonly number[]).includes(n) ? (n as T) : INVALID;
  },
  write: (value) => (value === fallback ? null : String(value)),
});

/** A filter's value: any non-empty text, then only one the loaded list holds. */
const placeKey = (of: (known: Known) => ReadonlySet<string> | null | undefined): KeyDef<string | null> => ({
  parse: (value, known) => {
    if (typeof value !== "string" || value === "") return INVALID;
    const values = of(known);
    return values && !values.has(value) ? INVALID : value;
  },
  write: (value) => value,
});

/** Layers by name, as a list or as comma-separated URL text; unknown names are dropped, the order is fixed. */
const hideKey: KeyDef<readonly MapLayer[]> = {
  parse: (value) => {
    const names = typeof value === "string" ? value.split(",") : Array.isArray(value) ? value : null;
    if (!names) return INVALID;
    return Object.freeze(MAP_LAYERS.filter((layer) => names.includes(layer)));
  },
  write: (value) => (value.length ? value.join(",") : null),
  same: (a, b) => a.join(",") === b.join(","),
};

/** Every key, in the order the URL writes them. */
export const KEYS: { readonly [K in StateKey]: KeyDef<WorkspaceState[K]> } = {
  analyst: flag,
  mode: enumKey<Mode>("screen", "screen", "compare"),
  rule: ruleKey,
  compare: ruleKey,
  k: lengthKey<FullRows>(20, 10, 20),
  view: enumKey<ListView>("ranked", "ranked", "queue"),
  qgroup: enumKey<QueueGrouping>("province", "province", "evidence"),
  place: enumKey<Placement>("lower", "lower", "upper"),
  scope: flag,
  prov: placeKey((known) => known.provinces),
  loc: placeKey((known) => known.localities),
  formula: flag,
  parts: flag,
  hide: hideKey,
  panel: { parse: oneOf("export"), write: (value) => value },
  n: lengthKey<TopLength>(20, 10, 20, 30),
  school: schoolKey,
  hover: schoolKey,
  // A popover is a passing state: a link never opens one.
  pop: { parse: oneOf<Pop>("layers", "filter", "pickA", "pickB", "rules"), write: () => null },
};

const STATE_KEYS = Object.keys(KEYS) as StateKey[];

const same = <K extends StateKey>(key: K, a: WorkspaceState[K], b: WorkspaceState[K]): boolean =>
  (KEYS[key] as KeyDef<WorkspaceState[K]>).same?.(a, b) ?? a === b;

/** The rules that hold across keys. Runs after every change, so no caller can leave the state inconsistent. */
function normalise(state: WorkspaceState, known: Known): WorkspaceState {
  let next = state;
  // The default rule is stored as null, so a link to the default list carries no rule at all.
  if (next.rule === known.defaultRule) next = { ...next, rule: null };
  const shown = next.rule ?? known.defaultRule;
  if (next.compare === shown) next = { ...next, compare: null };
  if (next.mode === "compare") {
    // Compare mode is method detail, and always has two rules: the reference defaults to the paper's main rule, and
    // the main rule's comparison to the next rule the API lists.
    if (!next.analyst) next = { ...next, analyst: true };
    if (next.compare === null) {
      const other =
        shown !== known.defaultRule
          ? known.defaultRule
          : ([...(known.ruleIds ?? [])].find((id) => id !== shown) as RuleId | undefined);
      if (other)
        next =
          shown === known.defaultRule
            ? { ...next, rule: other, compare: shown }
            : { ...next, compare: other };
    }
  } else if (next.pop === "pickA" || next.pop === "pickB") next = { ...next, pop: null };
  if (!next.analyst && next.pop !== null && next.pop !== "rules") next = { ...next, pop: null };
  return next;
}

/** `a` and `b`, the names the guide contract gives the two rules of compare mode, as the keys that hold them. */
function withRuleNames(patch: Patch): Patch {
  if (patch.a === undefined && patch.b === undefined) return patch;
  const { a, b, ...rest } = patch;
  return { ...rest, ...(a !== undefined ? { compare: a } : {}), ...(b !== undefined ? { rule: b } : {}) };
}

/** The state after `patch`. Keys not named keep their value; an invalid value is ignored; `null` clears. */
export function applyPatch(state: WorkspaceState, input: Patch, known: Known): WorkspaceState {
  const patch = withRuleNames(input);
  let next: WorkspaceState = state;
  for (const key of STATE_KEYS) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (value === undefined) continue;
    const def = KEYS[key] as KeyDef<WorkspaceState[typeof key]>;
    const parsed = value === null ? DEFAULT_STATE[key] : def.parse(value, known);
    if (parsed === INVALID) continue;
    if (!same(key, next[key], parsed)) next = { ...next, [key]: parsed };
  }
  // Turning the method details off while comparing returns to the plain list on the compared rule, where What changed
  // keeps the comparison. Asking for compare mode, or a link that has both, keeps the method details on.
  if (next.mode === "compare" && !next.analyst && "analyst" in patch && !("mode" in patch))
    next = { ...next, mode: "screen" };
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
  return STATE_KEYS.every((key) => same(key, a[key], b[key]));
}

/** The state a URL describes, starting from the defaults. Parameters that are not workspace keys are ignored. */
export function stateFromSearch(search: string, known: Known): WorkspaceState {
  const params = new URLSearchParams(search);
  const patch: Record<string, string> = {};
  for (const key of [...STATE_KEYS, "a", "b"]) {
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
  // `a` and `b` are read as `compare` and `rule`, and written under those names.
  for (const key of [...STATE_KEYS, "a", "b"]) params.delete(key);
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
