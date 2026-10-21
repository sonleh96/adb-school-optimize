/**
 * The saved views' store: what is kept, in the browser's local storage. Storage that is blocked or full never breaks
 * the screen; the views then last until the page closes. React reads the store through `useSyncExternalStore`.
 *
 * Two tabs share one storage. Each change is made to what storage holds at that moment, not to what this tab read
 * earlier, so neither tab's save overwrites the other's, and a view is removed by what it is, not by where it sat.
 * A write in another tab reaches this one through the browser's `storage` event, so its rail shows the change.
 */
import { type Entry, VIEWS_KEY, parseEntries, serialise, withRemoved, withSaved } from "./views";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
/** Where the browser announces another tab's writes: the window. */
type StorageEvents = {
  addEventListener(type: "storage", listener: (event: { key: string | null }) => void): void;
};

export interface ViewsStore {
  /** What is kept; null when nothing is, so the seeds show. Stable between changes. */
  entries(): readonly Entry[] | null;
  subscribe(listener: () => void): () => void;
  save(name: string, q: string): void;
  /** Removes the view that is `entry` (`SavedView.entry`), wherever it now sits. */
  remove(entry: Entry): void;
  /** Back to the seeds alone. */
  reset(): void;
}

export function createViewsStore(storage: Storage | null, events: StorageEvents | null = null): ViewsStore {
  // False once storage has refused a read or a write: from then on this tab works from what it holds.
  let usable = storage !== null;
  const read = (): readonly Entry[] | null => {
    if (!usable) return entries;
    try {
      return parseEntries(storage!.getItem(VIEWS_KEY));
    } catch {
      usable = false;
      return entries;
    }
  };
  let entries: readonly Entry[] | null = null;
  entries = read();
  let written = entries === null ? null : serialise(entries);
  const listeners = new Set<() => void>();
  const tell = () => listeners.forEach((listener) => listener());

  function commit(change: (current: readonly Entry[] | null) => readonly Entry[] | null) {
    const next = change(read());
    entries = next;
    written = next === null ? null : serialise(next);
    if (usable)
      try {
        if (next === null) storage!.removeItem(VIEWS_KEY);
        else storage!.setItem(VIEWS_KEY, written!);
      } catch {
        // Blocked or full: the views stay for this visit only.
        usable = false;
      }
    tell();
  }

  events?.addEventListener("storage", (event) => {
    if (!usable || (event.key !== null && event.key !== VIEWS_KEY)) return;
    const next = read();
    const text = next === null ? null : serialise(next);
    if (text === written) return;
    entries = next;
    written = text;
    tell();
  });

  return {
    entries: () => entries,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    save: (name, q) => commit((current) => withSaved(current, name, q)),
    remove: (entry) => commit((current) => withRemoved(current, entry)),
    reset: () => commit(() => null),
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
  shared = createViewsStore(storage, window);
  return shared;
}
