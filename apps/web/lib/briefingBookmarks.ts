import { parseUrlState, serializeUrlState, SUPPORTED_SCHOOL_LAYER_KEYS, type UrlState } from "@/lib/urlState";
import { EMPTY_SCHOOL_FILTERS, normalizeSchoolFilters, serializeSchoolFilters } from "@/lib/schoolFilters";

export const BRIEFING_BOOKMARKS_STORAGE_KEY = "rise-png-briefing-bookmarks-v1";
export const BRIEFING_BOOKMARKS_SCHEMA_VERSION = 1;
export const MAX_USER_BOOKMARKS = 12;
export const MAX_BOOKMARK_NAME_LENGTH = 60;

export const MAP_BOOKMARK_PATHS = ["/all-schools", "/school-explorer", "/district-explorer"] as const;

export type BookmarkPathname = (typeof MAP_BOOKMARK_PATHS)[number];

export type BriefingBookmark = {
  id: string;
  name: string;
  pathname: BookmarkPathname;
  state: UrlState;
  kind: "seeded" | "user";
};

type StoredBookmark = Omit<BriefingBookmark, "kind">;

const NATIONAL_MAP_VIEW = { lat: -6.314993, lng: 147, zoom: 6 };
const PORT_MORESBY_MAP_VIEW = { lat: -9.4438, lng: 147.1803, zoom: 10 };

export const SEEDED_BRIEFING_BOOKMARKS: readonly BriefingBookmark[] = [
  {
    id: "seed-national-overview",
    name: "National overview",
    pathname: "/all-schools",
    state: {
      school: null,
      district: null,
      province: null,
      score: "priority",
      compare: null,
      indicator: null,
      scenario: null,
      filters: EMPTY_SCHOOL_FILTERS,
      catchment: false,
      layers: [],
      mapView: NATIONAL_MAP_VIEW,
    },
    kind: "seeded",
  },
  {
    id: "seed-port-moresby-priority-schools",
    name: "Port Moresby priority schools",
    pathname: "/school-explorer",
    state: {
      school: null,
      district: "National Capital District",
      province: null,
      score: "priority",
      compare: null,
      indicator: null,
      scenario: null,
      filters: EMPTY_SCHOOL_FILTERS,
      catchment: false,
      layers: [],
      mapView: null,
    },
    kind: "seeded",
  },
  {
    id: "seed-high-aqi-focus",
    name: "High AQI focus",
    pathname: "/school-explorer",
    state: {
      school: null,
      district: "National Capital District",
      province: null,
      score: "priority",
      compare: null,
      indicator: null,
      scenario: null,
      filters: EMPTY_SCHOOL_FILTERS,
      catchment: false,
      layers: ["air_quality_mean"],
      mapView: PORT_MORESBY_MAP_VIEW,
    },
    kind: "seeded",
  },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replaceAll(/\s+/g, " ");
  return name && name.length <= MAX_BOOKMARK_NAME_LENGTH ? name : null;
}

function isBookmarkPathname(value: unknown): value is BookmarkPathname {
  return typeof value === "string" && MAP_BOOKMARK_PATHS.includes(value as BookmarkPathname);
}

function isStableId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
}

function normalizeString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result ? result : null;
}

function parseStoredState(value: unknown): UrlState | null {
  if (!isRecord(value)) return null;
  const score = value.score;
  if (score != null && score !== "priority" && score !== "need") return null;
  const filters =
    value.filters == null
      ? EMPTY_SCHOOL_FILTERS
      : typeof value.filters === "object"
        ? normalizeSchoolFilters(value.filters)
        : null;
  if (!filters) return null;
  const compare = value.compare;
  if (compare != null && compare !== "priority-need") return null;
  if (value.catchment != null && typeof value.catchment !== "boolean") return null;
  if (
    !Array.isArray(value.layers) ||
    !value.layers.every((layer) => SUPPORTED_SCHOOL_LAYER_KEYS.includes(layer))
  ) {
    return null;
  }
  const mapView = value.mapView;
  if (
    mapView != null &&
    (!isRecord(mapView) ||
      typeof mapView.lat !== "number" ||
      typeof mapView.lng !== "number" ||
      typeof mapView.zoom !== "number")
  ) {
    return null;
  }

  const params = new URLSearchParams();
  const strings = ["school", "district", "province", "indicator", "scenario"] as const;
  for (const key of strings) {
    const string = normalizeString(value[key]);
    if (value[key] != null && string == null) return null;
    if (string) params.set(key, string);
  }
  if (score) params.set("score", score);
  const serializedFilters = serializeSchoolFilters(filters);
  if (serializedFilters) params.set("filters", serializedFilters);
  if (compare) params.set("compare", compare);
  if (value.catchment === true) params.set("catchment", "1");
  if (value.layers.length) params.set("layers", value.layers.join(","));
  if (mapView) {
    params.set("lat", String(mapView.lat));
    params.set("lng", String(mapView.lng));
    params.set("z", String(mapView.zoom));
  }

  const parsed = parseUrlState(params);
  if (mapView && !parsed.mapView) return null;
  return parsed;
}

function parseStoredBookmark(value: unknown): StoredBookmark | null {
  if (!isRecord(value)) return null;
  const id = isStableId(value.id) ? value.id : null;
  const name = normalizeName(value.name);
  const pathname = isBookmarkPathname(value.pathname) ? value.pathname : null;
  const state = parseStoredState(value.state);
  if (!id || !name || !pathname || !state) return null;
  return { id, name, pathname, state };
}

export function loadUserBriefingBookmarks(storage: Storage): BriefingBookmark[] {
  try {
    const stored = storage.getItem(BRIEFING_BOOKMARKS_STORAGE_KEY);
    if (!stored) return [];
    const payload: unknown = JSON.parse(stored);
    if (
      !isRecord(payload) ||
      payload.version !== BRIEFING_BOOKMARKS_SCHEMA_VERSION ||
      !Array.isArray(payload.items)
    ) {
      return [];
    }

    const usedIds = new Set(SEEDED_BRIEFING_BOOKMARKS.map((bookmark) => bookmark.id));
    return payload.items
      .map(parseStoredBookmark)
      .filter((bookmark): bookmark is StoredBookmark => {
        if (!bookmark || usedIds.has(bookmark.id)) return false;
        usedIds.add(bookmark.id);
        return true;
      })
      .slice(0, MAX_USER_BOOKMARKS)
      .map((bookmark) => ({ ...bookmark, kind: "user" }));
  } catch {
    return [];
  }
}

export function saveUserBriefingBookmarks(storage: Storage, bookmarks: readonly BriefingBookmark[]) {
  const items = bookmarks
    .filter((bookmark) => bookmark.kind === "user")
    .slice(0, MAX_USER_BOOKMARKS)
    .map(({ id, name, pathname, state }) => ({ id, name, pathname, state }));
  storage.setItem(
    BRIEFING_BOOKMARKS_STORAGE_KEY,
    JSON.stringify({ version: BRIEFING_BOOKMARKS_SCHEMA_VERSION, items })
  );
}

export function clearUserBriefingBookmarks(storage: Storage) {
  storage.removeItem(BRIEFING_BOOKMARKS_STORAGE_KEY);
}

export function createBookmarkId(): string {
  const random = globalThis.crypto?.randomUUID?.().replaceAll("-", "") ?? Math.random().toString(36).slice(2);
  return `bookmark_${Date.now()}_${random}`.slice(0, 80);
}

export function bookmarkHref(pathname: BookmarkPathname, state: UrlState): string {
  const search = serializeUrlState(new URLSearchParams(), state);
  return `${pathname}${search ? `?${search}` : ""}`;
}

export function sameBookmarkState(left: UrlState, right: UrlState): boolean {
  return serializeUrlState(new URLSearchParams(), left) === serializeUrlState(new URLSearchParams(), right);
}

function sameMapView(left: UrlState["mapView"], right: UrlState["mapView"]): boolean {
  if (!left) return true;
  if (!right) return false;
  return (
    left.lat.toFixed(6) === right.lat.toFixed(6) &&
    left.lng.toFixed(6) === right.lng.toFixed(6) &&
    left.zoom.toFixed(2) === right.zoom.toFixed(2)
  );
}

/** Seeded stops match their specified lens fields while user stops remain exact snapshots. */
export function bookmarkMatchesState(bookmark: BriefingBookmark, current: UrlState): boolean {
  if (bookmark.kind === "user") return sameBookmarkState(bookmark.state, current);

  const strings = ["school", "district", "province", "indicator", "scenario"] as const;
  for (const key of strings) {
    if (bookmark.state[key] != null && bookmark.state[key] !== current[key]) return false;
  }
  if (bookmark.state.score != null && bookmark.state.score !== current.score) return false;
  if (bookmark.state.catchment !== current.catchment) return false;
  if (bookmark.state.compare !== current.compare) return false;
  if (serializeSchoolFilters(bookmark.state.filters) !== serializeSchoolFilters(current.filters))
    return false;
  if (bookmark.state.layers.join(",") !== current.layers.join(",")) return false;
  return sameMapView(bookmark.state.mapView, current.mapView);
}
