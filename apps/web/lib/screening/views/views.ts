/**
 * Saved views for meetings: what is kept, how it is read back, and the list a person sees.
 *
 * A view is the workspace's URL state plus a name (notes/final.md, decision 5; the W4b brief). The four seeds are
 * not stored as states: each is kept as a reference (`{ seed: "range" }`) and built again from the loaded data at
 * every load, by role, so a seed never names a school by id and a seed whose subject the data lacks is not offered.
 * Nothing stored means the seeds alone. Storage that is blocked or holds junk reads as nothing stored.
 */
import { type WorkspaceState, searchWithState } from "../workspace/state";

export const SEED_KEYS = ["top", "urgency", "range", "queue"] as const;
export type SeedKey = (typeof SEED_KEYS)[number];
const isSeedKey = (value: unknown): value is SeedKey =>
  typeof value === "string" && (SEED_KEYS as readonly string[]).includes(value);

/** One kept view: a seed by reference, or a view a person saved, with its name and its URL state (no "?"). */
export type Entry = { readonly seed: SeedKey } | { readonly name: string; readonly q: string };

/** The URL state of each seed the loaded data can show. A seed missing here is not offered. */
export type Seeds = Readonly<Partial<Record<SeedKey, string>>>;

/** A view as the rail and the export sheet list it. */
export interface SavedView {
  /** Where the view sits in what is kept, for removing it. */
  readonly at: number;
  readonly seed: SeedKey | null;
  /** The name a person gave the view; null for a seed, which the copy names. */
  readonly name: string | null;
  readonly q: string;
  /** What is kept for it, so it is removed by what it is, not by where it sits. */
  readonly entry: Entry;
  /** Its name in a link (`gview`): a short hash of what it is, the same in any list that holds it. */
  readonly id: string;
}

/**
 * A view's id: FNV-1a over what the view is (its seed or its name, and its state), in base 36. The same view gets
 * the same id in a colleague's list, so a pasted link names it there too; a view they do not have names nothing.
 */
export function viewIdOf(view: Pick<SavedView, "seed" | "name" | "q">): string {
  const text = `${view.seed ? `seed:${view.seed}` : `name:${view.name ?? ""}`}\n${view.q}`;
  let hash = 0x811c9dc5;
  for (const char of text) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

export const VIEWS_KEY = "rise-screening-saved-views-v1";
/** The longest name the name field takes (notes/final.md, R2). */
export const NAME_MAX = 60;
/** A stored URL state longer than any the workspace writes is junk. */
const QUERY_MAX = 2000;
/** The most views kept. A meeting needs a handful; a list of thousands made the rail take seconds to draw. */
export const VIEWS_MAX = 50;
/** How many stored items are looked at, so storage holding a huge list is never read whole. */
const ITEMS_READ = VIEWS_MAX * 4;

/** The seeds, in order: what nothing stored means, and what a first save starts from. */
export const SEED_ENTRIES: readonly Entry[] = Object.freeze(SEED_KEYS.map((seed) => ({ seed })));

/** Whether what is kept is the starting views alone, in order, so there is nothing to restore. */
export const isStarting = (entries: readonly Entry[] | null): boolean =>
  entries === null ||
  (entries.length === SEED_KEYS.length &&
    entries.every((entry, i) => "seed" in entry && entry.seed === SEED_KEYS[i]));

/**
 * A typed name as it is kept: format characters removed (zero-width characters and bidirectional controls, which
 * make a name invisible or reorder the text after it), spaces trimmed and collapsed, at most `NAME_MAX` characters
 * (not UTF-16 units). A right-to-left name keeps its letters; the screen sets each name in its own direction.
 */
export function cleanName(raw: string): string {
  const name = raw
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(name).slice(0, NAME_MAX).join("").trim();
}

/**
 * The URL state a view keeps: every workspace key, less what only passes. The pointer's school, an open sheet and an
 * open popover are not part of a screen to come back to.
 */
export function viewQuery(state: WorkspaceState): string {
  return searchWithState("", { ...state, hover: null, panel: null, pack: false, pop: null }).replace(
    /^\?/,
    ""
  );
}

function entryOf(raw: unknown): Entry | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  if (isSeedKey(item.seed)) return { seed: item.seed };
  if (typeof item.name !== "string" || typeof item.q !== "string") return null;
  const name = cleanName(item.name);
  const q = item.q.replace(/^\?/, "");
  if (!name || q.length > QUERY_MAX) return null;
  return { name, q };
}

/**
 * What storage held, read defensively. `null` means nothing usable is kept, so the seeds show; an empty list means the
 * person removed every view. A list whose every item is junk is junk, not an empty list.
 */
export function parseEntries(text: string | null): Entry[] | null {
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  // Only the shape this screen writes is read; anything else, a bare list included, is junk.
  if (!raw || typeof raw !== "object" || (raw as { v?: unknown }).v !== 1) return null;
  const items = (raw as { views?: unknown }).views;
  if (!Array.isArray(items)) return null;
  const entries = items
    .slice(0, ITEMS_READ)
    .map(entryOf)
    .filter((entry): entry is Entry => entry !== null);
  if (items.length > 0 && entries.length === 0) return null;
  // A seed is offered once, and no more than the cap are kept.
  const seen = new Set<SeedKey>();
  return entries
    .filter((entry) => {
      if (!("seed" in entry)) return true;
      if (seen.has(entry.seed)) return false;
      seen.add(entry.seed);
      return true;
    })
    .slice(0, VIEWS_MAX);
}

/** Whether there is room for one more view. */
export const canSave = (entries: readonly Entry[] | null): boolean =>
  (entries ?? SEED_ENTRIES).length < VIEWS_MAX;

export const serialise = (entries: readonly Entry[]): string => JSON.stringify({ v: 1, views: entries });

/** The views the person sees: what is kept, or the seeds, less the seeds the loaded data cannot show. */
export function resolve(entries: readonly Entry[] | null, seeds: Seeds): SavedView[] {
  const views = (entries ?? SEED_ENTRIES).flatMap((entry, at): Omit<SavedView, "id">[] => {
    if ("seed" in entry) {
      const q = seeds[entry.seed];
      return q === undefined ? [] : [{ at, seed: entry.seed, name: null, q, entry }];
    }
    return [{ at, seed: null, name: entry.name, q: entry.q, entry }];
  });
  // Two views that are the same (one name, one state) are told apart by which of them comes first.
  const seen = new Map<string, number>();
  return views.map((view) => {
    const base = viewIdOf(view);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { ...view, id: n === 1 ? base : `${base}y${n}` };
  });
}

/**
 * What is kept after saving a view: the seeds, if nothing was kept yet, then the new view last. At the cap nothing
 * changes and the same list comes back.
 */
export function withSaved<T extends readonly Entry[] | null>(
  entries: T,
  name: string,
  q: string
): T | Entry[] {
  if (!canSave(entries)) return entries;
  return [...(entries ?? SEED_ENTRIES), { name: cleanName(name), q: q.replace(/^\?/, "") }];
}

const sameEntry = (a: Entry, b: Entry): boolean =>
  "seed" in a ? "seed" in b && a.seed === b.seed : !("seed" in b) && a.name === b.name && a.q === b.q;

/**
 * What is kept after removing `target`: the first entry that is the same view, wherever it now sits, so a list another
 * tab has changed meanwhile loses the view chosen and no other.
 */
export function withRemoved(entries: readonly Entry[] | null, target: Entry): Entry[] {
  const list = entries ?? SEED_ENTRIES;
  const at = list.findIndex((entry) => sameEntry(entry, target));
  return at < 0 ? [...list] : list.filter((_, i) => i !== at);
}
