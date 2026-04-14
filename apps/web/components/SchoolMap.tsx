"use client";

import L, { LatLngBounds } from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, GeoJSON, ImageOverlay, MapContainer, Pane, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";

import { buildRasterOverlayUrl, fetchLayerFeatures, fetchRasterMetadata } from "@/lib/api";
import { scoreToColor } from "@/lib/color";
import type { RasterMetadataResponse, SchoolRecord, VectorLayerFeature, VectorLayerFeaturesResponse } from "@/lib/types";

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

const VECTOR_LIMIT_DEFAULT = 30000;
const ACCESS_POINTS_MAX_RENDER = 16000;

function FitSchools({ schools }: { schools: SchoolRecord[] }) {
  const map = useMap();
  useEffect(() => {
    if (schools.length === 0) return;
    const bounds = new LatLngBounds(schools.map((school) => [school.latitude, school.longitude] as [number, number]));
    map.fitBounds(bounds.pad(0.18));
  }, [map, schools]);

  return null;
}

function ViewportBoundsWatcher({ onChange }: { onChange: (bbox: Bbox4326) => void }) {
  const map = useMap();
  useMapEvents({
    moveend: () => onChange(boundsToBbox4326(map.getBounds())),
    zoomend: () => onChange(boundsToBbox4326(map.getBounds())),
  });

  useEffect(() => {
    onChange(boundsToBbox4326(map.getBounds()));
  }, [map, onChange]);

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

function cacheKey(prefix: string, district: string, province: string | undefined, bbox4326: Bbox4326 | null): string {
  const bboxPart = bbox4326 ? bbox4326.map((value) => value.toFixed(5)).join(",") : "none";
  return `${prefix}|province=${province ?? ""}|district=${district}|bbox=${bboxPart}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
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
}: {
  schools: SchoolRecord[];
  selectedSchoolId: string | null;
  onSelectSchool: (schoolId: string | null) => void;
  scoreField: "priority" | "need";
  district: string;
  province?: string;
  layers: SchoolLayerToggle[];
  showDistrictProvinceInPopup?: boolean;
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
  const [showLayerLegend, setShowLayerLegend] = useState(true);
  const [viewportBbox, setViewportBbox] = useState<Bbox4326 | null>(null);
  const [debouncedViewportBbox, setDebouncedViewportBbox] = useState<Bbox4326 | null>(null);
  const cacheRef = useRef<Map<string, LayerCacheValue>>(new Map());

  const activeLayers = useMemo<Set<SchoolLayerKey>>(
    () => new Set(layers.filter((layer) => layer.active).map((layer) => layer.key)),
    [layers]
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
    async (layer: "flood" | "landcover" | "elevation" | "luminosity", opacity: number): Promise<RasterMetadataResponse> => {
      const key = cacheKey(`raster:${layer}:opacity=${opacity}`, district, province, null);
      const cached = cacheRef.current.get(key);
      if (cached) return cached as RasterMetadataResponse;
      const response = await fetchRasterMetadata({ layer, district, province, opacity });
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

      try {
        const jobs: Promise<void>[] = [];
        let accessThinned = false;

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

        if (activeLayers.has("access_walk")) {
          jobs.push(
            Promise.all([loadVectorLayer("pop_access_walk", VECTOR_LIMIT_DEFAULT), loadVectorLayer("pop_no_walk", VECTOR_LIMIT_DEFAULT)]).then(
              (responses) => {
                const merged = responses.flatMap((response) => response.items);
                accessThinned = accessThinned || merged.length > ACCESS_POINTS_MAX_RENDER;
                next.access_walk = thinByStride(merged, ACCESS_POINTS_MAX_RENDER);
              }
            )
          );
        }

        if (activeLayers.has("access_cycle")) {
          jobs.push(
            Promise.all([loadVectorLayer("pop_access_cycle", VECTOR_LIMIT_DEFAULT), loadVectorLayer("pop_no_cycle", VECTOR_LIMIT_DEFAULT)]).then(
              (responses) => {
                const merged = responses.flatMap((response) => response.items);
                accessThinned = accessThinned || merged.length > ACCESS_POINTS_MAX_RENDER;
                next.access_cycle = thinByStride(merged, ACCESS_POINTS_MAX_RENDER);
              }
            )
          );
        }

        if (activeLayers.has("access_drive")) {
          jobs.push(
            Promise.all([loadVectorLayer("pop_access_drive", VECTOR_LIMIT_DEFAULT), loadVectorLayer("pop_no_drive", VECTOR_LIMIT_DEFAULT)]).then(
              (responses) => {
                const merged = responses.flatMap((response) => response.items);
                accessThinned = accessThinned || merged.length > ACCESS_POINTS_MAX_RENDER;
                next.access_drive = thinByStride(merged, ACCESS_POINTS_MAX_RENDER);
              }
            )
          );
        }

        if (activeLayers.has("flood")) {
          jobs.push(
            loadRasterLayer("flood", 0.55).then((response) => {
              next.flood = response;
            })
          );
        }

        if (activeLayers.has("landcover")) {
          jobs.push(
            loadRasterLayer("landcover", 0.75).then((response) => {
              next.landcover = response;
            })
          );
        }

        if (activeLayers.has("elevation")) {
          jobs.push(
            loadRasterLayer("elevation", 0.7).then((response) => {
              next.elevation = response;
            })
          );
        }

        if (activeLayers.has("luminosity")) {
          jobs.push(
            loadRasterLayer("luminosity", 0.7).then((response) => {
              next.luminosity = response;
            })
          );
        }

        if (jobs.length === 0) {
          if (!cancelled) {
            setLayerState(next);
            setLayerStatus("");
          }
          return;
        }

        setLayerStatus("Loading active layers...");
        await Promise.all(jobs);
        if (!cancelled) {
          setLayerState(next);
          setLayerStatus(accessThinned ? "Showing sampled access points to keep map rendering responsive." : "");
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
  }, [activeLayers, district, loadRasterLayer, loadVectorLayer, province]);

  const selectedAQIField = selectedAirField(activeLayers);

  const renderAccessLayer = (features: VectorLayerFeature[]) => {
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
            fillOpacity: 0.48,
            weight: 0.6,
          });
        }}
      />
    );
  };

  return (
    <div className="school-map-root">
      <MapContainer center={[-6.314993, 147.0]} zoom={6} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitSchools schools={schools} />
        <ViewportBoundsWatcher onChange={setViewportBbox} />

        {activeLayers.has("roads") && layerState.roads.length > 0 ? (
          <Pane name="roads-layer" style={{ zIndex: 420 }}>
            <GeoJSON data={toFeatureCollection(layerState.roads)} style={{ color: "#a855f7", weight: 1.1, opacity: 0.75 }} />
          </Pane>
        ) : null}

        {(activeLayers.has("air_quality_mean") || activeLayers.has("air_quality_max")) && layerState.air_quality.length > 0 ? (
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
                return { color, fillColor: color, weight: 0.9, opacity: 0.72, fillOpacity: 0.24 };
              }}
              onEachFeature={(feature, layer) => {
                const properties = asRecord(feature.properties);
                const value =
                  selectedAQIField === "aqi_us_max"
                    ? findNumericProperty(properties, ["aqi_us_max"])
                    : findNumericProperty(properties, ["aqi_us_mean"]);
                const location = String(properties.location ?? properties.feature_name ?? "Unknown tile");
                const aqiText = value != null ? value.toFixed(2) : "n/a";
                const maxValue = findNumericProperty(properties, ["aqi_us_max"]);
                const maxText = maxValue != null ? maxValue.toFixed(2) : "n/a";
                layer.bindPopup(
                  `<strong>Air Quality</strong><br/>Tile: ${location}<br/>AQI (${selectedAQIField === "aqi_us_max" ? "max" : "mean"}): ${aqiText}<br/>AQI (max): ${maxText}<br/>Category: ${airQualityCategory(value)}`
                );
              }}
            />
          </Pane>
        ) : null}

        {(activeLayers.has("access_walk") || activeLayers.has("access_cycle") || activeLayers.has("access_drive")) ? (
          <Pane name="access-layer" style={{ zIndex: 440 }}>
            {activeLayers.has("access_walk") ? renderAccessLayer(layerState.access_walk) : null}
            {activeLayers.has("access_cycle") ? renderAccessLayer(layerState.access_cycle) : null}
            {activeLayers.has("access_drive") ? renderAccessLayer(layerState.access_drive) : null}
          </Pane>
        ) : null}

        {activeLayers.has("flood") && layerState.flood ? (
          <Pane name="flood-layer" style={{ zIndex: 410 }}>
            <ImageOverlay
              url={buildRasterOverlayUrl({ layer: "flood", district, province, opacity: layerState.flood.opacity, format: "png" })}
              bounds={rasterBounds(layerState.flood)}
              opacity={layerState.flood.opacity}
              interactive={false}
            />
          </Pane>
        ) : null}

        {activeLayers.has("landcover") && layerState.landcover ? (
          <Pane name="landcover-layer" style={{ zIndex: 415 }}>
            <ImageOverlay
              url={buildRasterOverlayUrl({ layer: "landcover", district, province, opacity: layerState.landcover.opacity, format: "png" })}
              bounds={rasterBounds(layerState.landcover)}
              opacity={layerState.landcover.opacity}
              interactive={false}
            />
          </Pane>
        ) : null}

        {activeLayers.has("elevation") && layerState.elevation ? (
          <Pane name="elevation-layer" style={{ zIndex: 417 }}>
            <ImageOverlay
              url={buildRasterOverlayUrl({ layer: "elevation", district, province, opacity: layerState.elevation.opacity, format: "png" })}
              bounds={rasterBounds(layerState.elevation)}
              opacity={layerState.elevation.opacity}
              interactive={false}
            />
          </Pane>
        ) : null}

        {activeLayers.has("luminosity") && layerState.luminosity ? (
          <Pane name="luminosity-layer" style={{ zIndex: 418 }}>
            <ImageOverlay
              url={buildRasterOverlayUrl({ layer: "luminosity", district, province, opacity: layerState.luminosity.opacity, format: "png" })}
              bounds={rasterBounds(layerState.luminosity)}
              opacity={layerState.luminosity.opacity}
              interactive={false}
            />
          </Pane>
        ) : null}

        <Pane name="school-popup-pane" style={{ zIndex: 1100 }} />
        <Pane name="school-markers" style={{ zIndex: 650 }}>
          {schools.map((school) => {
            const score = scoreField === "priority" ? school.priority : school.need;
            const color = scoreToColor(score);
            const isSelected = school.school_id === selectedSchoolId;

            return (
              <CircleMarker
                key={school.school_id ?? `${school.school_name}-${school.latitude}-${school.longitude}`}
                center={[school.latitude, school.longitude]}
                radius={isSelected ? 10 : 7}
                pathOptions={{
                  color: "#000000",
                  fillColor: color,
                  fillOpacity: isSelected ? 0.95 : 0.78,
                  weight: isSelected ? 3 : 1,
                }}
                eventHandlers={{ click: () => onSelectSchool(school.school_id ?? null) }}
              >
                <Popup pane="school-popup-pane">
                  <strong>{school.school_name}</strong>
                  {showDistrictProvinceInPopup ? (
                    <>
                      <br />
                      District: {school.district}
                      <br />
                      Province: {school.province}
                    </>
                  ) : null}
                  <br />
                  Priority: {school.priority != null ? (school.priority * 100).toFixed(1) : "n/a"}
                  <br />
                  Need: {school.need != null ? (school.need * 100).toFixed(1) : "n/a"}
                </Popup>
              </CircleMarker>
            );
          })}
        </Pane>
      </MapContainer>

      {layerStatus ? <div className="map-status-overlay">{layerStatus}</div> : null}

      {activeLayers.size > 0 ? (
        <div className="layer-legend-panel map-layer-legend-overlay">
          <div className="layer-legend-header">
            <p className="layer-legend-heading">Active Layer Legends</p>
            <button type="button" className="layer-legend-toggle" onClick={() => setShowLayerLegend((current) => !current)}>
              {showLayerLegend ? "Hide" : "Show"}
            </button>
          </div>
          {showLayerLegend ? (
            <>
              {activeLayers.has("flood") ? (
                <div className="layer-legend-item">
                  <p className="layer-legend-title">Flood Raster</p>
                  <div className="legend-gradient flood-gradient" />
                  <p className="layer-legend-note">Lower flood signal to higher flood signal</p>
                </div>
              ) : null}

              {activeLayers.has("landcover") ? (
                <div className="layer-legend-item">
                  <p className="layer-legend-title">Land Cover Raster</p>
                  <div className="legend-row">
                    <span className="legend-dot" style={{ background: "#419bdf" }} />
                    <span className="small-copy">Water</span>
                    <span className="legend-dot" style={{ background: "#397d49" }} />
                    <span className="small-copy">Trees</span>
                    <span className="legend-dot" style={{ background: "#88b053" }} />
                    <span className="small-copy">Grass</span>
                    <span className="legend-dot" style={{ background: "#7a87c6" }} />
                    <span className="small-copy">Flooded Vegetation</span>
                    <span className="legend-dot" style={{ background: "#e49635" }} />
                    <span className="small-copy">Crops</span>
                    <span className="legend-dot" style={{ background: "#dfc35a" }} />
                    <span className="small-copy">Shrub</span>
                    <span className="legend-dot" style={{ background: "#c4281b" }} />
                    <span className="small-copy">Built-up</span>
                    <span className="legend-dot" style={{ background: "#a59b8f" }} />
                    <span className="small-copy">Bare</span>
                    <span className="legend-dot" style={{ background: "#b39fe1" }} />
                    <span className="small-copy">Snow/Ice</span>
                  </div>
                </div>
              ) : null}

              {activeLayers.has("elevation") ? (
                <div className="layer-legend-item">
                  <p className="layer-legend-title">Elevation</p>
                  <div className="legend-gradient grayscale-gradient" />
                  <p className="layer-legend-note">Lower elevation to higher elevation</p>
                </div>
              ) : null}

              {activeLayers.has("luminosity") ? (
                <div className="layer-legend-item">
                  <p className="layer-legend-title">Nighttime Luminosity</p>
                  <div className="legend-gradient grayscale-gradient" />
                  <p className="layer-legend-note">Lower luminosity to higher luminosity</p>
                </div>
              ) : null}

              {(activeLayers.has("air_quality_mean") || activeLayers.has("air_quality_max")) ? (
                <div className="layer-legend-item">
                  <p className="layer-legend-title">Air Pollution (AQI {selectedAQIField === "aqi_us_max" ? "Maximum" : "Mean"})</p>
                  <div className="legend-row">
                    <span className="legend-dot" style={{ background: "#00E400" }} />
                    <span className="small-copy">Good (0-50)</span>
                    <span className="legend-dot" style={{ background: "#FFFF00" }} />
                    <span className="small-copy">Moderate (51-100)</span>
                    <span className="legend-dot" style={{ background: "#FF7E00" }} />
                    <span className="small-copy">USG (101-150)</span>
                    <span className="legend-dot" style={{ background: "#FF0000" }} />
                    <span className="small-copy">Unhealthy (151-200)</span>
                    <span className="legend-dot" style={{ background: "#8F3F97" }} />
                    <span className="small-copy">Very Unhealthy (201-300)</span>
                    <span className="legend-dot" style={{ background: "#7E0023" }} />
                    <span className="small-copy">Hazardous (300+)</span>
                  </div>
                  <p className="layer-legend-note">Click a tile to inspect AQI values.</p>
                </div>
              ) : null}

              {(activeLayers.has("access_walk") || activeLayers.has("access_cycle") || activeLayers.has("access_drive")) ? (
                <div className="layer-legend-item">
                  <p className="layer-legend-title">Access Grids</p>
                  <div className="legend-row">
                    {activeLayers.has("access_walk") ? (
                      <>
                        <span className="legend-dot" style={{ background: "#059669" }} />
                        <span className="small-copy">Walk within</span>
                        <span className="legend-dot" style={{ background: "#c2410c" }} />
                        <span className="small-copy">Walk outside</span>
                      </>
                    ) : null}
                    {activeLayers.has("access_cycle") ? (
                      <>
                        <span className="legend-dot" style={{ background: "#0891b2" }} />
                        <span className="small-copy">Cycle within</span>
                        <span className="legend-dot" style={{ background: "#9a3412" }} />
                        <span className="small-copy">Cycle outside</span>
                      </>
                    ) : null}
                    {activeLayers.has("access_drive") ? (
                      <>
                        <span className="legend-dot" style={{ background: "#6366f1" }} />
                        <span className="small-copy">Drive within</span>
                        <span className="legend-dot" style={{ background: "#be123c" }} />
                        <span className="small-copy">Drive outside</span>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
