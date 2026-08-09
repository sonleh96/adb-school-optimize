"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  EMPTY_SCHOOL_FILTERS,
  parseSchoolFilters,
  serializeSchoolFilters,
  type SchoolFilters,
} from "@/lib/schoolFilters";

export const SUPPORTED_SCHOOL_LAYER_KEYS = [
  "roads",
  "air_quality_mean",
  "air_quality_max",
  "access_walk",
  "access_cycle",
  "access_drive",
  "landcover",
  "flood",
  "elevation",
  "luminosity",
] as const;

export type SupportedSchoolLayerKey = (typeof SUPPORTED_SCHOOL_LAYER_KEYS)[number];

export type MapView = {
  lat: number;
  lng: number;
  zoom: number;
};

export type CompareMode = "priority-need";

export type UrlState = {
  school: string | null;
  district: string | null;
  province: string | null;
  score: "priority" | "need" | null;
  compare: CompareMode | null;
  indicator: string | null;
  scenario: string | null;
  filters: SchoolFilters;
  catchment: boolean;
  layers: SupportedSchoolLayerKey[];
  mapView: MapView | null;
};

type UrlStatePatch = Partial<UrlState>;

const STRING_KEYS = ["school", "district", "province", "indicator", "scenario"] as const;
const KNOWN_KEYS = [...STRING_KEYS, "score", "compare", "filters", "catchment", "layers", "lat", "lng", "z"] as const;
const SUPPORTED_LAYER_SET = new Set<string>(SUPPORTED_SCHOOL_LAYER_KEYS);
const MIN_ZOOM = 1;
const MAX_ZOOM = 22;

function trimmed(value: string | null): string | null {
  const result = value?.trim();
  return result ? result : null;
}

function parseFinite(value: string | null): number | null {
  if (value == null || value.trim() === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function normalizeLayers(layers: readonly string[]): SupportedSchoolLayerKey[] {
  const active = new Set(layers.filter((layer) => SUPPORTED_LAYER_SET.has(layer)));
  if (active.has("air_quality_mean") && active.has("air_quality_max")) {
    active.delete("air_quality_max");
  }
  return SUPPORTED_SCHOOL_LAYER_KEYS.filter((layer) => active.has(layer));
}

function isSafeMapView(mapView: MapView | null | undefined): mapView is MapView {
  return Boolean(
    mapView &&
    Number.isFinite(mapView.lat) &&
    Number.isFinite(mapView.lng) &&
    Number.isFinite(mapView.zoom) &&
    mapView.lat >= -90 &&
    mapView.lat <= 90 &&
    mapView.lng >= -180 &&
    mapView.lng <= 180 &&
    mapView.zoom >= MIN_ZOOM &&
    mapView.zoom <= MAX_ZOOM
  );
}

export function parseUrlState(search: URLSearchParams | ReadonlyURLSearchParams): UrlState {
  const lat = parseFinite(search.get("lat"));
  const lng = parseFinite(search.get("lng"));
  const zoom = parseFinite(search.get("z"));
  const validMapView =
    lat != null &&
    lng != null &&
    zoom != null &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    zoom >= MIN_ZOOM &&
    zoom <= MAX_ZOOM;
  const score = trimmed(search.get("score"));
  const compare = trimmed(search.get("compare"));
  const layers = normalizeLayers((search.get("layers") ?? "").split(",").map((layer) => layer.trim()));

  return {
    school: trimmed(search.get("school")),
    district: trimmed(search.get("district")),
    province: trimmed(search.get("province")),
    score: score === "priority" || score === "need" ? score : null,
    compare: compare === "priority-need" ? compare : null,
    indicator: trimmed(search.get("indicator")),
    scenario: trimmed(search.get("scenario")),
    filters: parseSchoolFilters(search.get("filters")),
    catchment: search.get("catchment") === "1",
    layers,
    mapView: validMapView ? { lat, lng, zoom } : null,
  };
}

function setString(params: URLSearchParams, key: string, value: string | null | undefined) {
  if (value == null || !value.trim()) {
    params.delete(key);
    return;
  }
  params.set(key, value.trim());
}

function setMapView(params: URLSearchParams, mapView: MapView | null | undefined) {
  params.delete("lat");
  params.delete("lng");
  params.delete("z");
  if (!isSafeMapView(mapView)) return;
  params.set("lat", mapView.lat.toFixed(6));
  params.set("lng", mapView.lng.toFixed(6));
  params.set("z", mapView.zoom.toFixed(2));
}

export function serializeUrlState(
  search: URLSearchParams | ReadonlyURLSearchParams,
  patch: UrlStatePatch
): string {
  const params = new URLSearchParams(search.toString());
  for (const key of KNOWN_KEYS) params.delete(key);
  const state = { ...parseUrlState(search), ...patch };

  for (const key of STRING_KEYS) setString(params, key, state[key]);
  if (state.score) params.set("score", state.score);
  const filters = serializeSchoolFilters(state.filters ?? EMPTY_SCHOOL_FILTERS);
  if (filters) params.set("filters", filters);
  if (state.compare === "priority-need") params.set("compare", state.compare);
  if (state.catchment) params.set("catchment", "1");
  const layers = normalizeLayers(state.layers);
  if (layers.length) params.set("layers", layers.join(","));
  setMapView(params, state.mapView);
  return params.toString();
}

export function mergeUrlState(current: UrlState, patch: UrlStatePatch): UrlState {
  return { ...current, ...patch };
}

export function buildShareableUrl(state: UrlState): string {
  const search = serializeUrlState(new URLSearchParams(window.location.search), state);
  return `${window.location.origin}${window.location.pathname}${search ? `?${search}` : ""}`;
}

export function useShareableUrlState() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const latestSearchRef = useRef(searchParams.toString());
  const initialState = useMemo(() => parseUrlState(searchParams), [searchParams]);

  useEffect(() => {
    const search = searchParams.toString();
    if (window.location.search.slice(1) === search) latestSearchRef.current = search;
  }, [searchParams]);

  const replaceState = useCallback(
    (patch: UrlStatePatch) => {
      const currentSearch = new URLSearchParams(latestSearchRef.current);
      const search = serializeUrlState(currentSearch, patch);
      latestSearchRef.current = search;
      router.replace(`${pathname}${search ? `?${search}` : ""}`, { scroll: false });
    },
    [pathname, router]
  );

  return { initialState, replaceState };
}

type ReadonlyURLSearchParams = Pick<URLSearchParams, "get" | "toString">;
