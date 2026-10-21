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
}

export const VIEWS_KEY = "rise-screening-saved-views-v1";
/** The longest name the name field takes (notes/final.md, R2). */
export const NAME_MAX = 60;
/** A stored URL state longer than any the workspace writes is junk. */
const QUERY_MAX = 2000;

/** The seeds, in order: what nothing stored means, and what a first save starts from. */
export const SEED_ENTRIES: readonly Entry[] = Object.freeze(SEED_KEYS.map((seed) => ({ seed })));

/** Whether what is kept is the starting views alone, in order, so there is nothing to restore. */
export const isStarting = (entries: readonly Entry[] | null): boolean =>
  entries === null ||
  (entries.length === SEED_KEYS.length &&
    entries.every((entry, i) => "seed" in entry && entry.seed === SEED_KEYS[i]));

/** A typed name as it is kept: spaces trimmed and collapsed, at most `NAME_MAX` characters (not UTF-16 units). */
export function cleanName(raw: string): string {
  const name = raw.replace(/\s+/g, " ").trim();
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

/** The final design's prototype kept a bare list of `{ name, q, seed }`, with its seeds as fixed states. */
function fromPrototype(items: readonly unknown[]): Entry[] {
  return items
    .map((item) => {
      const seed = item && typeof item === "object" ? (item as Record<string, unknown>).seed : null;
      return isSeedKey(seed) ? { seed } : entryOf(item);
    })
    .filter((entry): entry is Entry => entry !== null);
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
  let items: readonly unknown[];
  let entries: Entry[];
  if (Array.isArray(raw)) {
    items = raw;
    entries = fromPrototype(raw);
  } else if (raw && typeof raw === "object" && (raw as { v?: unknown }).v === 1) {
    const views = (raw as { views?: unknown }).views;
    if (!Array.isArray(views)) return null;
    items = views;
    entries = views.map(entryOf).filter((entry): entry is Entry => entry !== null);
  } else return null;
  if (items.length > 0 && entries.length === 0) return null;
  // A seed is offered once.
  const seen = new Set<SeedKey>();
  return entries.filter((entry) => {
    if (!("seed" in entry)) return true;
    if (seen.has(entry.seed)) return false;
    seen.add(entry.seed);
    return true;
  });
}

export const serialise = (entries: readonly Entry[]): string => JSON.stringify({ v: 1, views: entries });

/** The views the person sees: what is kept, or the seeds, less the seeds the loaded data cannot show. */
export function resolve(entries: readonly Entry[] | null, seeds: Seeds): SavedView[] {
  return (entries ?? SEED_ENTRIES).flatMap((entry, at): SavedView[] => {
    if ("seed" in entry) {
      const q = seeds[entry.seed];
      return q === undefined ? [] : [{ at, seed: entry.seed, name: null, q }];
    }
    return [{ at, seed: null, name: entry.name, q: entry.q }];
  });
}

/** What is kept after saving a view: the seeds, if nothing was kept yet, then the new view last. */
export function withSaved(entries: readonly Entry[] | null, name: string, q: string): Entry[] {
  return [...(entries ?? SEED_ENTRIES), { name: cleanName(name), q: q.replace(/^\?/, "") }];
}

/** What is kept after removing the kept entry at `at`. */
export const withRemoved = (entries: readonly Entry[] | null, at: number): Entry[] =>
  (entries ?? SEED_ENTRIES).filter((_, i) => i !== at);
