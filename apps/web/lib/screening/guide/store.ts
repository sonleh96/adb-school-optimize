/**
 * The guidance layers' store: the reducer's state, the person's memory, and the guides the data can teach. It keeps
 * its own URL keys in step (every other key belongs to the workspace and is left as it is) and writes the memory to
 * local storage. React reads it through `useSyncExternalStore`.
 */
import {
  type Catalog,
  EMPTY_MEMORY,
  INITIAL_STATE,
  type LayerEvent,
  type LayerState,
  MEMORY_KEY,
  type Memory,
  type Model,
  parseMemory,
  reduce,
  revalidate,
  revalidateViews,
  searchWithLayers,
  stateFromSearch,
} from "./machine";

export interface LayerSnapshot {
  readonly state: LayerState;
  readonly memory: Memory;
  readonly catalog: Catalog | null;
  /** Each saved view's id, in order, once their store has read them. */
  readonly views: readonly string[] | null;
  /** The URL and the memory have been read; until then the page's boot script decides the rail's width. */
  readonly attached: boolean;
}

export interface LayerStore {
  snapshot(): LayerSnapshot;
  subscribe(listener: () => void): () => void;
  dispatch(event: LayerEvent): void;
  /** What the data can teach. Revalidates a pasted link against it. */
  setCatalog(catalog: Catalog): void;
  /** The saved views' ids, in order. Revalidates a pasted link to one of them. */
  setViews(views: readonly string[]): void;
  /** Read the URL and the memory once, before the first paint, and keep the URL in step from then on. */
  attach(
    location: Pick<Location, "search" | "pathname" | "hash">,
    history: Pick<History, "replaceState">,
    storage: Pick<Storage, "getItem" | "setItem"> | null
  ): void;
}

const sameCatalog = (a: Catalog | null, b: Catalog) =>
  !!a && a.length === b.length && a.every((g, i) => g.id === b[i].id && g.steps === b[i].steps);

export function createLayerStore(): LayerStore {
  let snap: LayerSnapshot = {
    state: INITIAL_STATE,
    memory: EMPTY_MEMORY,
    catalog: null,
    views: null,
    attached: false,
  };
  const listeners = new Set<() => void>();
  let env: {
    location: Pick<Location, "search" | "pathname" | "hash">;
    history: Pick<History, "replaceState">;
    storage: Pick<Storage, "getItem" | "setItem"> | null;
  } | null = null;

  function commit(next: LayerSnapshot) {
    if (
      next.state === snap.state &&
      next.memory === snap.memory &&
      next.catalog === snap.catalog &&
      next.views === snap.views &&
      next.attached === snap.attached
    )
      return;
    const previous = snap;
    snap = next;
    if (env) {
      const { location, history, storage } = env;
      if (next.state !== previous.state || next.memory.seen !== previous.memory.seen) {
        const search = searchWithLayers(location.search, next.state, next.memory);
        if (search !== location.search)
          history.replaceState(null, "", `${location.pathname}${search}${location.hash}`);
      }
      if (next.memory !== previous.memory && storage) {
        try {
          storage.setItem(MEMORY_KEY, JSON.stringify(next.memory));
        } catch {
          // Storage can be full or blocked; the guides still work, they only forget between visits.
        }
      }
    }
    listeners.forEach((listener) => listener());
  }

  return {
    snapshot: () => snap,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch(event) {
      const model: Model = { state: snap.state, memory: snap.memory };
      const next = reduce(model, event, snap.catalog, snap.views);
      if (next !== model) commit({ ...snap, state: next.state, memory: next.memory });
    },
    setCatalog(catalog) {
      if (sameCatalog(snap.catalog, catalog)) return;
      commit({ ...snap, catalog, state: revalidate(snap.state, catalog) });
    },
    setViews(views) {
      if (snap.views && snap.views.join(" ") === views.join(" ")) return;
      commit({ ...snap, views, state: revalidateViews(snap.state, views) });
    },
    attach(location, history, storage) {
      if (env) return;
      env = { location, history, storage };
      let text: string | null = null;
      try {
        text = storage?.getItem(MEMORY_KEY) ?? null;
      } catch {
        text = null;
      }
      const memory = parseMemory(text);
      const read = stateFromSearch(location.search, memory);
      const state = snap.catalog ? revalidate(read, snap.catalog) : read;
      commit({
        ...snap,
        attached: true,
        memory,
        state: snap.views ? revalidateViews(state, snap.views) : state,
      });
    },
  };
}
