/**
 * The saved views' store: what is kept, in the browser's local storage. Storage that is blocked or full never breaks
 * the screen; the views then last until the page closes. React reads the store through `useSyncExternalStore`.
 */
import { type Entry, VIEWS_KEY, parseEntries, serialise, withRemoved, withSaved } from "./views";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

export interface ViewsStore {
  /** What is kept; null when nothing is, so the seeds show. Stable between changes. */
  entries(): readonly Entry[] | null;
  subscribe(listener: () => void): () => void;
  save(name: string, q: string): void;
  /** Removes the kept entry at `at` (`SavedView.at`). */
  remove(at: number): void;
  /** Back to the seeds alone. */
  reset(): void;
}

export function createViewsStore(storage: Storage | null): ViewsStore {
  let entries: readonly Entry[] | null = null;
  try {
    entries = parseEntries(storage?.getItem(VIEWS_KEY) ?? null);
  } catch {
    entries = null;
  }
  const listeners = new Set<() => void>();

  function commit(next: readonly Entry[] | null) {
    entries = next;
    try {
      if (next === null) storage?.removeItem(VIEWS_KEY);
      else storage?.setItem(VIEWS_KEY, serialise(next));
    } catch {
      // Blocked or full: the views stay for this visit only.
    }
    listeners.forEach((listener) => listener());
  }

  return {
    entries: () => entries,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    save: (name, q) => commit(withSaved(entries, name, q)),
    remove: (at) => commit(withRemoved(entries, at)),
    reset: () => commit(null),
  };
}

let shared: ViewsStore | null = null;

/** The page's one store, made on first use in the browser. Reading `localStorage` itself can throw when it is blocked. */
export function viewsStore(): ViewsStore {
  if (shared) return shared;
  let storage: Storage | null = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  shared = createViewsStore(storage);
  return shared;
}
