/**
 * The workspace controller: the one way the screen, the URL and the layers above it (the guide rail, help mode)
 * read and change the workspace. React components subscribe to it; nothing reaches into another component's markup.
 *
 *   const ws = useWorkspace();
 *   await ws.ready;                        // the map has drawn, with every mark the list has (or a phone's List settled)
 *   ws.setState({ rule: "additive_no_u", compare: "additive_u" });
 *   ws.getState().rule;                    // the rule on screen, never null
 *   const stop = ws.onChange((state, previous) => { ... });
 */
import type { RuleId } from "../types";

import {
  DEFAULT_STATE,
  type Known,
  type Pane,
  type Patch,
  type WorkspaceState,
  applyPatch,
  revalidate,
  sameState,
  searchWithState,
  shownRule,
  stateFromSearch,
} from "./state";

/** The state as callers see it: the rule is always the one on screen. */
export type ResolvedState = Omit<WorkspaceState, "rule"> & { readonly rule: RuleId };

export interface WorkspaceController {
  getState(): ResolvedState;
  /** Keys not named keep their value; an invalid value is ignored; `null` clears a key to its default. */
  setState(patch: Patch): void;
  /** Called after every change with the new and the previous state. Returns the unsubscribe function. */
  onChange(listener: (state: ResolvedState, previous: ResolvedState) => void): () => void;
  /**
   * Resolves once the map has drawn, with every mark the list has: none, for an empty or failed list. On a phone's
   * List, which fetches no map until Map is chosen, it resolves once the list has settled.
   */
  readonly ready: Promise<void>;
}

/** The browser's address and history, as far as the workspace uses them. */
export type BrowserLocation = Pick<Location, "search" | "pathname" | "hash">;
export type BrowserHistory = Pick<History, "state" | "replaceState" | "pushState" | "back">;

/**
 * What the workspace keeps in each history entry it writes, beside the address. A school card, the export sheet and
 * the narrow layout's Map view cover the list, and on a phone Back is how a reader closes them, so opening one pushes an
 * entry and Back closes it. Nothing else does: stepping through schools, a rule or a tab only rewrites the entry.
 */
interface Entry {
  /** How many entries the workspace has pushed up to and including this one: one per covering view opened. */
  readonly depth: number;
  /** The narrow layout's view, which the address never keeps, so Back from a card opened on the map returns there. */
  readonly pane: Pane;
}
const ENTRY_KEY = "riseWorkspace";

function entryOf(data: unknown): Entry | null {
  const entry = (data as Record<string, unknown> | null)?.[ENTRY_KEY] as Partial<Entry> | undefined;
  return entry && typeof entry.depth === "number" && (entry.pane === "list" || entry.pane === "map")
    ? { depth: entry.depth, pane: entry.pane }
    : null;
}

/** The workspace's part of a history entry's data, for another layer that rewrites the same entry. */
export const keepWorkspaceEntry = (data: unknown): Record<string, Entry> | null => {
  const entry = entryOf(data);
  return entry ? { [ENTRY_KEY]: entry } : null;
};

/** The keys of the views that cover the list. */
const covering = (s: WorkspaceState): Patch => ({
  school: s.school,
  panel: s.panel,
  pack: s.pack,
  pane: s.pane,
});
const opens = (from: WorkspaceState, to: WorkspaceState) =>
  (from.school === null && to.school !== null) ||
  (from.panel === null && to.panel !== null) ||
  (from.pane === "list" && to.pane === "map");
const closes = (from: WorkspaceState, to: WorkspaceState) => opens(to, from) && !opens(from, to);

/** What the page itself needs on top of the public controller. */
export interface WorkspaceStore extends WorkspaceController {
  /** The raw state, for `useSyncExternalStore`. Stable between changes. */
  snapshot(): WorkspaceState;
  subscribe(listener: () => void): () => void;
  known(): Known;
  /** Tell the store what the loaded data holds, so it can check values against it. */
  setKnown(known: Partial<Known>): void;
  /**
   * Read the URL once, on the page's first render in the browser, and keep it in step from then on. A URL that says
   * more than its state, such as an invalid value or a default spelled out, is rewritten at once.
   */
  attachUrl(location: BrowserLocation, history: BrowserHistory): void;
  /**
   * Read the URL again after Back or Forward, and follow it. Back past an entry the workspace pushed closes what that
   * entry opened and keeps everything else on screen as it is.
   */
  readUrl(): void;
  markReady(): void;
}

export function createWorkspaceStore(defaultRule: RuleId): WorkspaceStore {
  let state: WorkspaceState = DEFAULT_STATE;
  let known: Known = { ruleIds: null, defaultRule, schoolKeys: null };
  const raw = new Set<() => void>();
  const listeners = new Set<(state: ResolvedState, previous: ResolvedState) => void>();
  let url: { location: BrowserLocation; history: BrowserHistory } | null = null;
  /** The depth of the history entry on screen, as last read or written. */
  let depth = 0;
  /**
   * The state on screen when the store went back past the entry of a covering view it closed, while that Back is under
   * way; null otherwise. A view opened before the Back lands is pushed against it once it does.
   */
  let backFrom: WorkspaceState | null = null;
  let markReady!: () => void;
  const ready = new Promise<void>((resolve) => (markReady = resolve));

  const resolve = (s: WorkspaceState): ResolvedState => ({ ...s, rule: shownRule(s, known) });

  /**
   * Write the state into the URL if the URL says anything else. After a caller's change (`from`, the state before it),
   * opening a covering view pushes an entry, and closing the one whose entry is on screen goes back past it.
   */
  function writeUrl(from?: WorkspaceState) {
    if (!url || backFrom) return;
    const { location, history } = url;
    const search = searchWithState(location.search, state);
    const href = `${location.pathname}${search}${location.hash}`;
    const here = entryOf(history.state);
    depth = here?.depth ?? 0;
    if (from && opens(from, state)) {
      depth += 1;
      history.pushState({ [ENTRY_KEY]: { depth, pane: state.pane } }, "", href);
    } else if (from && closes(from, state) && depth > 0) {
      // The entry goes with the view it opened, so a later Back never lands on a screen that looks the same.
      backFrom = state;
      history.back();
    } else if (search !== location.search || (here?.pane ?? "list") !== state.pane) {
      history.replaceState({ [ENTRY_KEY]: { depth, pane: state.pane } }, "", href);
    }
  }

  function commit(next: WorkspaceState, previousKnown: Known = known, byCaller = false) {
    if (next === state && previousKnown === known) return;
    const from = state;
    const previous = resolve(state);
    state = next;
    writeUrl(byCaller ? from : undefined);
    raw.forEach((listener) => listener());
    const current = resolve(state);
    listeners.forEach((listener) => listener(current, previous));
  }

  function readUrl() {
    if (!url) return;
    const entry = entryOf(url.history.state);
    const landed = entry?.depth ?? 0;
    const read = stateFromSearch(url.location.search, known);
    const there = entry ? applyPatch(read, { pane: entry.pane }, known) : read;
    // The store's own Back has nothing to follow: the close is already on screen. Back past an entry the workspace
    // pushed closes what it opened, and keeps the rest; any other move, such as Forward, brings back the whole entry.
    const settled = backFrom;
    const next = settled ? state : landed < depth ? applyPatch(state, covering(there), known) : there;
    backFrom = null;
    depth = landed;
    if (!sameState(next, state)) commit(next);
    // A view opened while the store's own Back was under way gets its entry now. A URL whose state is the one already
    // held can still carry junk or spelled-out defaults.
    writeUrl(settled ?? undefined);
  }

  return {
    getState: () => resolve(state),
    setState: (patch) => commit(applyPatch(state, patch, known), known, true),
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ready,
    snapshot: () => state,
    subscribe(listener) {
      raw.add(listener);
      return () => raw.delete(listener);
    },
    known: () => known,
    setKnown(update) {
      const previous = known;
      known = { ...known, ...update };
      const next = revalidate(state, known);
      // A new default rule changes what `rule: null` means, so listeners hear about it even if the state is the same.
      if (next !== state || previous.defaultRule !== known.defaultRule) commit(next, previous);
    },
    attachUrl(location, history) {
      if (url) return;
      url = { location, history };
      readUrl();
    },
    readUrl,
    markReady: () => markReady(),
  };
}
