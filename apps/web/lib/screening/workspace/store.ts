/**
 * The workspace controller: the one way the screen, the URL and the layers above it (the guide rail, help mode)
 * read and change the workspace. React components subscribe to it; nothing reaches into another component's markup.
 *
 *   const ws = useWorkspace();
 *   await ws.ready;                        // the map has drawn, with every mark the list has
 *   ws.setState({ rule: "additive_no_u", compare: "additive_u" });
 *   ws.getState().rule;                    // the rule on screen, never null
 *   const stop = ws.onChange((state, previous) => { ... });
 */
import type { RuleId } from "../types";

import {
  DEFAULT_STATE,
  type Known,
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
  /** Resolves once the map has drawn, with every mark the list has: none, for an empty or failed list. */
  readonly ready: Promise<void>;
}

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
  attachUrl(
    location: Pick<Location, "search" | "pathname" | "hash">,
    history: Pick<History, "replaceState">
  ): void;
  /** Read the URL again after Back or Forward, and follow it. */
  readUrl(): void;
  markReady(): void;
}

export function createWorkspaceStore(defaultRule: RuleId): WorkspaceStore {
  let state: WorkspaceState = DEFAULT_STATE;
  let known: Known = { ruleIds: null, defaultRule, schoolKeys: null };
  const raw = new Set<() => void>();
  const listeners = new Set<(state: ResolvedState, previous: ResolvedState) => void>();
  let url: {
    location: Pick<Location, "search" | "pathname" | "hash">;
    history: Pick<History, "replaceState">;
  } | null = null;
  let markReady!: () => void;
  const ready = new Promise<void>((resolve) => (markReady = resolve));

  const resolve = (s: WorkspaceState): ResolvedState => ({ ...s, rule: shownRule(s, known) });

  /** Write the state into the URL if the URL says anything else. */
  function writeUrl() {
    if (!url) return;
    const search = searchWithState(url.location.search, state);
    if (search !== url.location.search) {
      url.history.replaceState(null, "", `${url.location.pathname}${search}${url.location.hash}`);
    }
  }

  function commit(next: WorkspaceState, previousKnown: Known = known) {
    if (next === state && previousKnown === known) return;
    const previous = resolve(state);
    state = next;
    writeUrl();
    raw.forEach((listener) => listener());
    const current = resolve(state);
    listeners.forEach((listener) => listener(current, previous));
  }

  function readUrl() {
    if (!url) return;
    const next = stateFromSearch(url.location.search, known);
    if (!sameState(next, state)) commit(next);
    // A URL whose state is the one already held can still carry junk or spelled-out defaults.
    writeUrl();
  }

  return {
    getState: () => resolve(state),
    setState: (patch) => commit(applyPatch(state, patch, known)),
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
