"use client";

import L, { LatLngBounds } from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeatureCollection, Geometry, Point } from "geojson";
import { GeoJSON, ImageOverlay, MapContainer, Pane, TileLayer, useMap, useMapEvents } from "react-leaflet";

import { buildRasterOverlayUrl, fetchLayerFeatures, fetchRasterMetadata } from "@/lib/api";
import { MapScreenshotControl } from "@/components/MapScreenshotControl";
import { scoreToColor } from "@/lib/color";
import { districtIndicatorColor } from "@/lib/districtIndicatorPalette";
import { getDistrictScore, scoreExtent } from "@/lib/districtScores";
import type {
  DistrictRecord,
  RasterMetadataResponse,
  SchoolRecord,
  VectorLayerFeature,
  VectorLayerFeaturesResponse,
} from "@/lib/types";
import type { DistrictScoreField } from "@/lib/districtScores";
import type { MapView } from "@/lib/urlState";

export type SchoolLayerKey =
  | "roads"
  | "flood"
  | "landcover"
  | "elevation"
  | "luminosity"
  | "air_quality_mean"
  | "air_quality_max"
  | "access_walk"
  | "access_cycle"
  | "access_drive";

export type SchoolLayerToggle = {
  key: SchoolLayerKey;
  label: string;
  active: boolean;
  opacity: number;
};

type LayerState = {
  roads: VectorLayerFeature[];
  air_quality: VectorLayerFeature[];
  access_walk: VectorLayerFeature[];
  access_cycle: VectorLayerFeature[];
  access_drive: VectorLayerFeature[];
  flood: RasterMetadataResponse | null;
  landcover: RasterMetadataResponse | null;
  elevation: RasterMetadataResponse | null;
  luminosity: RasterMetadataResponse | null;
};

type Bbox4326 = [number, number, number, number];
type LayerCacheValue = VectorLayerFeaturesResponse | RasterMetadataResponse;

const VECTOR_LIMIT_DEFAULT = 5000;
const ACCESS_POINTS_MAX_RENDER = 8000;
const ACCESS_LAYER_MIN_ZOOM = 9;
const HEAVY_LAYER_MIN_ZOOM = 8;

function FitSchools({ schools, enabled }: { schools: SchoolRecord[]; enabled: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!enabled) return;
    if (schools.length === 0) return;
    const bounds = new LatLngBounds(
      schools.map((school) => [school.latitude, school.longitude] as [number, number])
    );
    map.fitBounds(bounds.pad(0.18));
  }, [enabled, map, schools]);

  return null;
}

function FocusSelectedSchool({
  schools,
  selectedSchoolId,
  enabled = true,
  suppressInitialFocus = false,
  suppressNextSelectionFocus = false,
  onSelectionFocusSuppressed,
}: {
  schools: SchoolRecord[];
  selectedSchoolId: string | null;
  enabled?: boolean;
  suppressInitialFocus?: boolean;
  suppressNextSelectionFocus?: boolean;
  onSelectionFocusSuppressed?: () => void;
}) {
  const map = useMap();
  const hasHandledSelection = useRef(false);
  const lastHandledSchoolId = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!selectedSchoolId) return;
    if (lastHandledSchoolId.current === selectedSchoolId) return;
    const school = schools.find((item) => item.school_id === selectedSchoolId);
    if (!school) return;
    const isInitialSelection = !hasHandledSelection.current;
    hasHandledSelection.current = true;
    lastHandledSchoolId.current = selectedSchoolId;
    if (suppressNextSelectionFocus) {
      onSelectionFocusSuppressed?.();
      return;
    }
    if (suppressInitialFocus && isInitialSelection) return;
    map.flyTo([school.latitude, school.longitude], Math.max(map.getZoom(), 11), {
      animate: true,
      duration: 0.7,
    });
  }, [
    enabled,
    map,
    onSelectionFocusSuppressed,
    schools,
    selectedSchoolId,
    suppressInitialFocus,
    suppressNextSelectionFocus,
  ]);

  return null;
}

function ApplyMapView({ mapView }: { mapView: MapView | null }) {
  const map = useMap();

  useEffect(() => {
    if (!mapView) return;
    const center = map.getCenter();
    if (
      Math.abs(center.lat - mapView.lat) < 0.000001 &&
      Math.abs(center.lng - mapView.lng) < 0.000001 &&
      Math.abs(map.getZoom() - mapView.zoom) < 0.01
    ) {
      return;
    }
    map.setView([mapView.lat, mapView.lng], mapView.zoom, { animate: false });
  }, [map, mapView]);

  return null;
}

function ViewportBoundsWatcher({
  onChange,
}: {
  onChange: (state: { bbox: Bbox4326; zoom: number; mapView: MapView }) => void;
}) {
  const map = useMap();
  const publish = useCallback(() => {
    onChange({
      bbox: boundsToBbox4326(map.getBounds()),
      zoom: map.getZoom(),
      mapView: {
        lat: map.getCenter().lat,
        lng: map.getCenter().lng,
        zoom: map.getZoom(),
      },
    });
  }, [map, onChange]);

  useMapEvents({
    moveend: publish,
    zoomend: publish,
  });

  useEffect(() => {
    publish();
  }, [publish]);

  return null;
}

function toFeatureCollection(features: VectorLayerFeature[]) {
  return {
    type: "FeatureCollection" as const,
    features: features.map((item) => ({
      type: "Feature" as const,
      properties: {
        vector_feature_id: item.vector_feature_id,
        layer_key: item.layer_key,
        feature_name: item.feature_name,
        province: item.province,
        district: item.district,
        ...item.properties,
      },
      geometry: item.geometry,
    })),
  };
}

function rasterBounds(metadata: RasterMetadataResponse): [[number, number], [number, number]] {
  const [minX, minY, maxX, maxY] = metadata.bounds_4326;
  return [
    [minY, minX],
    [maxY, maxX],
  ];
}

function boundsToBbox4326(bounds: LatLngBounds): Bbox4326 {
  const southWest = bounds.getSouthWest();
  const northEast = bounds.getNorthEast();
  return [southWest.lng, southWest.lat, northEast.lng, northEast.lat];
}

function thinByStride(features: VectorLayerFeature[], maxPoints: number): VectorLayerFeature[] {
  if (features.length <= maxPoints) return features;
  const step = Math.ceil(features.length / maxPoints);
  return features.filter((_, index) => index % step === 0);
}

function cacheKey(
  prefix: string,
  district: string,
  province: string | undefined,
  bbox4326: Bbox4326 | null
): string {
  const bboxPart = bbox4326 ? bbox4326.map((value) => value.toFixed(5)).join(",") : "none";
  return `${prefix}|province=${province ?? ""}|district=${district}|bbox=${bboxPart}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function hashMarkerValue(hash: number, value: string | number | null | undefined): number {
  const text = value == null ? "∅" : String(value);
  let next = hash ^ text.length;
  for (let index = 0; index < text.length; index += 1) {
    next ^= text.charCodeAt(index);
    next = Math.imul(next, 16777619);
  }
  return next;
}

function schoolMarkerSignature(schools: SchoolRecord[]): string {
  let hash = 2166136261;
  for (const school of schools) {
    hash = hashMarkerValue(hash, school.school_id);
    hash = hashMarkerValue(hash, school.school_name);
    hash = hashMarkerValue(hash, school.district);
    hash = hashMarkerValue(hash, school.province);
    hash = hashMarkerValue(hash, school.latitude);
    hash = hashMarkerValue(hash, school.longitude);
    hash = hashMarkerValue(hash, school.priority);
    hash = hashMarkerValue(hash, school.need);
  }
  return (hash >>> 0).toString(36);
}

function findNumericProperty(properties: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = properties[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function airQualityColor(value: number | null): string {
  if (value == null) return "#808080";
  if (value <= 50) return "#00E400";
  if (value <= 100) return "#FFFF00";
  if (value <= 150) return "#FF7E00";
  if (value <= 200) return "#FF0000";
  if (value <= 300) return "#8F3F97";
  return "#7E0023";
}

function airQualityCategory(value: number | null): string {
  if (value == null) return "Unknown";
  if (value <= 50) return "Good";
  if (value <= 100) return "Moderate";
  if (value <= 150) return "Unhealthy for Sensitive Groups";
  if (value <= 200) return "Unhealthy";
  if (value <= 300) return "Very Unhealthy";
  return "Hazardous";
}

function accessLayerColor(layerKey: string): string {
  if (layerKey.includes("walk")) return layerKey.includes("no_") ? "#c2410c" : "#059669";
  if (layerKey.includes("cycle")) return layerKey.includes("no_") ? "#9a3412" : "#0891b2";
  if (layerKey.includes("drive")) return layerKey.includes("no_") ? "#be123c" : "#6366f1";
  return layerKey.includes("no_") ? "#b45309" : "#0f766e";
}

function selectedAirField(activeLayers: Set<SchoolLayerKey>): "aqi_us_mean" | "aqi_us_max" | null {
  if (activeLayers.has("air_quality_max")) return "aqi_us_max";
  if (activeLayers.has("air_quality_mean")) return "aqi_us_mean";
  return null;
}

export function SchoolMap({
  schools,
  selectedSchoolId,
  onSelectSchool,
  scoreField,
  district,
  province,
  layers,
  showDistrictProvinceInPopup = true,
  screenshotFilePrefix = "school-map",
  districtFeatures = [],
  districtScoreField,
  focusSelectedSchool = true,
  mapView = null,
  onMapViewChange,
  hasExplicitMapView = false,
  comparePriorityAndNeed = false,
  suppressNextSelectionFocus = false,
  onSelectionFocusSuppressed,
}: {
  schools: SchoolRecord[];
  selectedSchoolId: string | null;
  onSelectSchool: (schoolId: string | null) => void;
  scoreField: "priority" | "need";
  district: string;
  province?: string;
  layers: SchoolLayerToggle[];
  showDistrictProvinceInPopup?: boolean;
  screenshotFilePrefix?: string;
  districtFeatures?: DistrictRecord[];
  districtScoreField?: DistrictScoreField;
  focusSelectedSchool?: boolean;
  mapView?: MapView | null;
  onMapViewChange?: (mapView: MapView) => void;
  hasExplicitMapView?: boolean;
  comparePriorityAndNeed?: boolean;
  suppressNextSelectionFocus?: boolean;
  onSelectionFocusSuppressed?: () => void;
}) {
  const [layerState, setLayerState] = useState<LayerState>({
    roads: [],
    air_quality: [],
    access_walk: [],
    access_cycle: [],
    access_drive: [],
    flood: null,
    landcover: null,
    elevation: null,
    luminosity: null,
  });
  const [layerStatus, setLayerStatus] = useState<string>("");
  const [viewportBbox, setViewportBbox] = useState<Bbox4326 | null>(null);
  const [viewportZoom, setViewportZoom] = useState(6);
  const [debouncedViewportBbox, setDebouncedViewportBbox] = useState<Bbox4326 | null>(null);
  const cacheRef = useRef<Map<string, LayerCacheValue>>(new Map());

  const activeLayerKeySignature = layers
    .filter((layer) => layer.active)
    .map((layer) => layer.key)
    .join(",");
  const activeLayers = useMemo<Set<SchoolLayerKey>>(
    () => new Set(activeLayerKeySignature ? (activeLayerKeySignature.split(",") as SchoolLayerKey[]) : []),
    [activeLayerKeySignature]
  );
  const layerOpacityByKey = useMemo(
    () => new Map(layers.map((layer) => [layer.key, layer.opacity])),
    [layers]
  );
  const layerOpacity = (layerKey: SchoolLayerKey) => layerOpacityByKey.get(layerKey) ?? 1;

  const onViewportChange = useCallback(
    (state: { bbox: Bbox4326; zoom: number; mapView: MapView }) => {
      setViewportBbox(state.bbox);
      setViewportZoom(state.zoom);
      onMapViewChange?.(state.mapView);
    },
    [onMapViewChange]
  );

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedViewportBbox(viewportBbox);
    }, 220);
    return () => window.clearTimeout(handle);
  }, [viewportBbox]);

  const loadVectorLayer = useCallback(
    async (layerKey: string, limit: number): Promise<VectorLayerFeaturesResponse> => {
      const key = cacheKey(`vector:${layerKey}:limit=${limit}`, district, province, debouncedViewportBbox);
      const cached = cacheRef.current.get(key);
      if (cached) return cached as VectorLayerFeaturesResponse;
      const response = await fetchLayerFeatures({
        layerKey,
        province,
        district,
        limit,
        bbox4326: debouncedViewportBbox ?? undefined,
      });
      cacheRef.current.set(key, response);
      return response;
    },
    [debouncedViewportBbox, district, province]
  );

  const loadRasterLayer = useCallback(
    async (layer: "flood" | "landcover" | "elevation" | "luminosity"): Promise<RasterMetadataResponse> => {
      const key = cacheKey(`raster:${layer}`, district, province, null);
      const cached = cacheRef.current.get(key);
      if (cached) return cached as RasterMetadataResponse;
      const response = await fetchRasterMetadata({ layer, district, province });
      cacheRef.current.set(key, response);
      return response;
    },
    [district, province]
  );

  useEffect(() => {
    let cancelled = false;
    const update = async () => {
      const next: LayerState = {
        roads: [],
        air_quality: [],
        access_walk: [],
        access_cycle: [],
        access_drive: [],
        flood: null,
        landcover: null,
        elevation: null,
        luminosity: null,
      };

      const wantsHeavyVector =
        activeLayers.has("roads") ||
        activeLayers.has("air_quality_mean") ||
        activeLayers.has("air_quality_max") ||
        activeLayers.has("access_walk") ||
        activeLayers.has("access_cycle") ||
        activeLayers.has("access_drive");
      const wantsAccess =
        activeLayers.has("access_walk") ||
        activeLayers.has("access_cycle") ||
        activeLayers.has("access_drive");

      if (wantsHeavyVector && !district && !debouncedViewportBbox) {
        if (!cancelled) {
          setLayerState(next);
          setLayerStatus("Pan the map to load vector layers for the current view.");
        }
        return;
      }

      if (wantsHeavyVector && viewportZoom < HEAVY_LAYER_MIN_ZOOM) {
        if (!cancelled) {
          setLayerState(next);
          setLayerStatus("Zoom in further to load road / AQI / access layers.");
        }
        return;
      }

      if (wantsAccess && viewportZoom < ACCESS_LAYER_MIN_ZOOM) {
        // Allow roads/AQI at HEAVY_LAYER_MIN_ZOOM, but keep access denser-only.
        if (
          !cancelled &&
          !activeLayers.has("roads") &&
          !activeLayers.has("air_quality_mean") &&
          !activeLayers.has("air_quality_max")
        ) {
          setLayerState(next);
          setLayerStatus(`Zoom to level ${ACCESS_LAYER_MIN_ZOOM}+ to load access grids.`);
          return;
        }
      }

      try {
        const jobs: Promise<void>[] = [];
        let accessThinned = false;
        let accessSkippedForZoom = false;

        if (activeLayers.has("roads")) {
          jobs.push(
            loadVectorLayer("roads", VECTOR_LIMIT_DEFAULT).then((response) => {
              next.roads = response.items;
            })
          );
        }

        if (activeLayers.has("air_quality_mean") || activeLayers.has("air_quality_max")) {
          jobs.push(
            loadVectorLayer("air_quality", VECTOR_LIMIT_DEFAULT).then((response) => {
              next.air_quality = response.items;
            })
          );
        }

        const canLoadAccess = viewportZoom >= ACCESS_LAYER_MIN_ZOOM;
        if (!canLoadAccess && wantsAccess) {
          accessSkippedForZoom = true;
        }

        if (canLoadAccess && activeLayers.has("access_walk")) {
          jobs.push(
            Promise.all([
              loadVectorLayer("pop_access_walk", VECTOR_LIMIT_DEFAULT),
              loadVectorLayer("pop_no_walk", VECTOR_LIMIT_DEFAULT),
            ]).then((responses) => {
              const merged = responses.flatMap((response) => response.items);
              accessThinned = accessThinned || merged.length > ACCESS_POINTS_MAX_RENDER;
              next.access_walk = thinByStride(merged, ACCESS_POINTS_MAX_RENDER);
            })
          );
        }

        if (canLoadAccess && activeLayers.has("access_cycle")) {
          jobs.push(
            Promise.all([
              loadVectorLayer("pop_access_cycle", VECTOR_LIMIT_DEFAULT),
              loadVectorLayer("pop_no_cycle", VECTOR_LIMIT_DEFAULT),
            ]).then((responses) => {
              const merged = responses.flatMap((response) => response.items);
              accessThinned = accessThinned || merged.length > ACCESS_POINTS_MAX_RENDER;
              next.access_cycle = thinByStride(merged, ACCESS_POINTS_MAX_RENDER);
            })
          );
        }

        if (canLoadAccess && activeLayers.has("access_drive")) {
          jobs.push(
            Promise.all([
              loadVectorLayer("pop_access_drive", VECTOR_LIMIT_DEFAULT),
              loadVectorLayer("pop_no_drive", VECTOR_LIMIT_DEFAULT),
            ]).then((responses) => {
              const merged = responses.flatMap((response) => response.items);
              accessThinned = accessThinned || merged.length > ACCESS_POINTS_MAX_RENDER;
              next.access_drive = thinByStride(merged, ACCESS_POINTS_MAX_RENDER);
            })
          );
        }

        if (activeLayers.has("flood")) {
          jobs.push(
            loadRasterLayer("flood").then((response) => {
              next.flood = response;
            })
          );
        }

        if (activeLayers.has("landcover")) {
          jobs.push(
            loadRasterLayer("landcover").then((response) => {
              next.landcover = response;
            })
          );
        }

        if (activeLayers.has("elevation")) {
          jobs.push(
            loadRasterLayer("elevation").then((response) => {
              next.elevation = response;
            })
          );
        }

        if (activeLayers.has("luminosity")) {
          jobs.push(
            loadRasterLayer("luminosity").then((response) => {
              next.luminosity = response;
            })
          );
        }

        if (jobs.length === 0) {
          if (!cancelled) {
            setLayerState(next);
            setLayerStatus(
              accessSkippedForZoom ? `Zoom to level ${ACCESS_LAYER_MIN_ZOOM}+ to load access grids.` : ""
            );
          }
          return;
        }

        setLayerStatus("Loading active layers...");
        await Promise.all(jobs);
        if (!cancelled) {
          setLayerState(next);
          if (accessThinned) {
            setLayerStatus("Showing sampled access points to keep map rendering responsive.");
          } else if (accessSkippedForZoom) {
            setLayerStatus(`Zoom to level ${ACCESS_LAYER_MIN_ZOOM}+ to load access grids.`);
          } else {
            setLayerStatus("");
          }
        }
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Failed to load selected layers.";
        setLayerStatus(message);
      }
    };

    update();
    return () => {
      cancelled = true;
    };
  }, [
    activeLayers,
    debouncedViewportBbox,
    district,
    loadRasterLayer,
    loadVectorLayer,
    province,
    viewportZoom,
  ]);

  const selectedAQIField = selectedAirField(activeLayers);
  const districtScoreRange = useMemo(
    () => (districtScoreField ? scoreExtent(districtFeatures, districtScoreField) : { min: 0, max: 1 }),
    [districtFeatures, districtScoreField]
  );

  const districtCollection = useMemo<FeatureCollection<Geometry> | null>(() => {
    if (!districtScoreField || districtFeatures.length === 0) return null;
    return {
      type: "FeatureCollection",
      features: districtFeatures.map((feature) => {
        const value = getDistrictScore(feature, districtScoreField);
        return {
          type: "Feature",
          geometry: feature.geometry as unknown as Geometry,
          properties: {
            district: feature.district,
            province: feature.province,
            value,
          },
        };
      }),
    };
  }, [districtFeatures, districtScoreField]);

  const schoolCollection = useMemo<FeatureCollection<Point>>(() => {
    return {
      type: "FeatureCollection",
      features: schools.map((school) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [school.longitude, school.latitude],
        },
        properties: {
          school_id: school.school_id ?? null,
          school_name: school.school_name,
          district: school.district,
          province: school.province,
          priority: school.priority ?? null,
          need: school.need ?? null,
        },
      })),
    };
  }, [schools]);
  const markerSignature = useMemo(() => schoolMarkerSignature(schools), [schools]);

  const renderAccessLayer = (features: VectorLayerFeature[], opacity: number) => {
    if (!features.length) return null;
    return (
      <GeoJSON
        data={toFeatureCollection(features)}
        pointToLayer={(feature, latlng) => {
          const layerKey = String(feature?.properties?.layer_key ?? "");
          const color = accessLayerColor(layerKey);
          return L.circleMarker(latlng, {
            radius: 3,
            color,
            fillColor: color,
            opacity,
            fillOpacity: opacity,
            weight: 0.6,
            renderer: L.canvas({ padding: 0.5 }),
          });
        }}
      />
    );
  };

  return (
    <div className="school-map-root">
      <MapContainer
        center={mapView ? [mapView.lat, mapView.lng] : [-6.314993, 147.0]}
        zoom={mapView?.zoom ?? 6}
        scrollWheelZoom
        preferCanvas
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          crossOrigin="anonymous"
        />
        <MapScreenshotControl filenamePrefix={screenshotFilePrefix} />
        <ApplyMapView mapView={mapView} />
        <FitSchools schools={schools} enabled={!hasExplicitMapView} />
        <FocusSelectedSchool
          schools={schools}
          selectedSchoolId={selectedSchoolId}
          enabled={focusSelectedSchool}
          suppressInitialFocus={hasExplicitMapView}
          suppressNextSelectionFocus={suppressNextSelectionFocus}
          onSelectionFocusSuppressed={onSelectionFocusSuppressed}
        />
        <ViewportBoundsWatcher onChange={onViewportChange} />

        {districtCollection ? (
          <Pane name="district-choropleth-layer" style={{ zIndex: 360 }}>
            <GeoJSON
              key={`districts-${districtScoreField}-${districtScoreRange.min}-${districtScoreRange.max}`}
              data={districtCollection}
              style={(feature) => {
                const value =
                  typeof feature?.properties?.value === "number" ? feature.properties.value : null;
                const normalized =
                  value == null || districtScoreRange.max === districtScoreRange.min
                    ? 0
                    : (value - districtScoreRange.min) / (districtScoreRange.max - districtScoreRange.min);
                return {
                  color: "rgba(15, 31, 51, 0.28)",
                  weight: 1,
                  fillColor: districtIndicatorColor(
                    districtScoreField === "priority" ? "Priority Score" : "Need Score",
                    normalized
                  ),
                  fillOpacity: value == null ? 0.12 : 0.48,
                };
              }}
              interactive={false}
            />
          </Pane>
        ) : null}

        {activeLayers.has("roads") && layerState.roads.length > 0 ? (
          <Pane name="roads-layer" style={{ zIndex: 420 }}>
            <GeoJSON
              data={toFeatureCollection(layerState.roads)}
              style={{ color: "#a855f7", weight: 1.1, opacity: layerOpacity("roads") }}
            />
          </Pane>
        ) : null}

        {(activeLayers.has("air_quality_mean") || activeLayers.has("air_quality_max")) &&
        layerState.air_quality.length > 0 ? (
          <Pane name="air-quality-layer" style={{ zIndex: 430 }}>
            <GeoJSON
              data={toFeatureCollection(layerState.air_quality)}
              style={(feature) => {
                const properties = asRecord(feature?.properties);
                const value =
                  selectedAQIField === "aqi_us_max"
                    ? findNumericProperty(properties, ["aqi_us_max"])
                    : findNumericProperty(properties, ["aqi_us_mean"]);
                const color = airQualityColor(value);
                const opacity = layerOpacity(
                  selectedAQIField === "aqi_us_max" ? "air_quality_max" : "air_quality_mean"
                );
                return { color, fillColor: color, weight: 0.9, opacity, fillOpacity: opacity * 0.33 };
              }}
              onEachFeature={(feature, layer) => {
                const properties = asRecord(feature.properties);
                const value =
                  selectedAQIField === "aqi_us_max"
                    ? findNumericProperty(properties, ["aqi_us_max"])
                    : findNumericProperty(properties, ["aqi_us_mean"]);
                const location = escapeHtml(
                  String(properties.location ?? properties.feature_name ?? "Unknown tile")
                );
                const aqiText = value != null ? value.toFixed(2) : "n/a";
                const maxValue = findNumericProperty(properties, ["aqi_us_max"]);
                const maxText = maxValue != null ? maxValue.toFixed(2) : "n/a";
                const modeLabel = selectedAQIField === "aqi_us_max" ? "max" : "mean";
                layer.bindPopup(
                  `<strong>Air Quality</strong><br/>Tile: ${location}<br/>AQI (${modeLabel}): ${aqiText}<br/>AQI (max): ${maxText}<br/>Category: ${escapeHtml(airQualityCategory(value))}`
                );
              }}
            />
          </Pane>
        ) : null}

        {activeLayers.has("access_walk") ||
        activeLayers.has("access_cycle") ||
        activeLayers.has("access_drive") ? (
          <Pane name="access-layer" style={{ zIndex: 440 }}>
            {activeLayers.has("access_walk")
              ? renderAccessLayer(layerState.access_walk, layerOpacity("access_walk"))
              : null}
            {activeLayers.has("access_cycle")
              ? renderAccessLayer(layerState.access_cycle, layerOpacity("access_cycle"))
              : null}
            {activeLayers.has("access_drive")
              ? renderAccessLayer(layerState.access_drive, layerOpacity("access_drive"))
              : null}
          </Pane>
        ) : null}

        {activeLayers.has("flood") && layerState.flood ? (
          <Pane name="flood-layer" style={{ zIndex: 410 }}>
            <ImageOverlay
              url={buildRasterOverlayUrl({
                layer: "flood",
                district,
                province,
                format: "png",
              })}
              bounds={rasterBounds(layerState.flood)}
              opacity={layerOpacity("flood")}
              interactive={false}
            />
          </Pane>
        ) : null}

        {activeLayers.has("landcover") && layerState.landcover ? (
          <Pane name="landcover-layer" style={{ zIndex: 415 }}>
            <ImageOverlay
              url={buildRasterOverlayUrl({
                layer: "landcover",
                district,
                province,
                format: "png",
              })}
              bounds={rasterBounds(layerState.landcover)}
              opacity={layerOpacity("landcover")}
              interactive={false}
            />
          </Pane>
        ) : null}

        {activeLayers.has("elevation") && layerState.elevation ? (
          <Pane name="elevation-layer" style={{ zIndex: 417 }}>
            <ImageOverlay
              url={buildRasterOverlayUrl({
                layer: "elevation",
                district,
                province,
                format: "png",
              })}
              bounds={rasterBounds(layerState.elevation)}
              opacity={layerOpacity("elevation")}
              interactive={false}
            />
          </Pane>
        ) : null}

        {activeLayers.has("luminosity") && layerState.luminosity ? (
          <Pane name="luminosity-layer" style={{ zIndex: 418 }}>
            <ImageOverlay
              url={buildRasterOverlayUrl({
                layer: "luminosity",
                district,
                province,
                format: "png",
              })}
              bounds={rasterBounds(layerState.luminosity)}
              opacity={layerOpacity("luminosity")}
              interactive={false}
            />
          </Pane>
        ) : null}

        <Pane name="school-popup-pane" style={{ zIndex: 1100 }} />
        <Pane name="school-markers" style={{ zIndex: 650 }}>
          {schoolCollection.features.length > 0 ? (
            <GeoJSON
              key={`schools-${scoreField}-${comparePriorityAndNeed ? "compare" : "single"}-${markerSignature}-${selectedSchoolId ?? "none"}-${showDistrictProvinceInPopup ? "location" : "no-location"}`}
              data={schoolCollection}
              pointToLayer={(feature, latlng) => {
                const props = asRecord(feature.properties);
                const score =
                  scoreField === "priority"
                    ? typeof props.priority === "number"
                      ? props.priority
                      : null
                    : typeof props.need === "number"
                      ? props.need
                      : null;
                const priorityScore = typeof props.priority === "number" ? props.priority : null;
                const needScore = typeof props.need === "number" ? props.need : null;
                const isSelected = props.school_id === selectedSchoolId;
                return L.circleMarker(latlng, {
                  radius: isSelected ? 10 : 7,
                  color: comparePriorityAndNeed ? scoreToColor(needScore) : "#000000",
                  fillColor: scoreToColor(comparePriorityAndNeed ? priorityScore : score),
                  fillOpacity: isSelected ? 0.95 : 0.78,
                  weight: comparePriorityAndNeed ? (isSelected ? 4 : 3) : isSelected ? 3 : 1,
                  renderer: L.canvas({ padding: 0.5 }),
                });
              }}
              onEachFeature={(feature, layer) => {
                const props = asRecord(feature.properties);
                const schoolId = typeof props.school_id === "string" ? props.school_id : null;
                const name = escapeHtml(String(props.school_name ?? "School"));
                const priority =
                  typeof props.priority === "number" ? (props.priority * 100).toFixed(1) : "n/a";
                const need = typeof props.need === "number" ? (props.need * 100).toFixed(1) : "n/a";
                const locationBits = showDistrictProvinceInPopup
                  ? `<br/>District: ${escapeHtml(String(props.district ?? ""))}<br/>Province: ${escapeHtml(String(props.province ?? ""))}`
                  : "";
                layer.bindPopup(
                  `<strong>${name}</strong>${locationBits}<br/>Priority: ${priority}<br/>Need: ${need}`,
                  { pane: "school-popup-pane" }
                );
                layer.on({
                  click: () => onSelectSchool(schoolId),
                });
              }}
            />
          ) : null}
        </Pane>
      </MapContainer>

      {layerStatus ? <div className="map-status-overlay">{layerStatus}</div> : null}
    </div>
  );
}
