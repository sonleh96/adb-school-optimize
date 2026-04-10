"use client";

import L, { LatLngBounds } from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, GeoJSON, ImageOverlay, MapContainer, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";

import { buildRasterOverlayUrl, fetchLayerFeatures, fetchRasterMetadata } from "@/lib/api";
import { scoreToColor } from "@/lib/color";
import type { RasterMetadataResponse, SchoolRecord, VectorLayerFeature, VectorLayerFeaturesResponse } from "@/lib/types";

type LayerToggle = {
  key: "roads" | "flood" | "landcover" | "air_quality" | "access";
  label: string;
  active: boolean;
};

type LayerState = {
  roads: VectorLayerFeature[];
  air_quality: VectorLayerFeature[];
  access: VectorLayerFeature[];
  flood: RasterMetadataResponse | null;
  landcover: RasterMetadataResponse | null;
};

type Bbox4326 = [number, number, number, number];
type LayerCacheValue = VectorLayerFeaturesResponse | RasterMetadataResponse;

const VECTOR_LIMIT_DEFAULT = 30000;
const ACCESS_POINTS_MAX_RENDER = 16000;

function FitSchools({ schools }: { schools: SchoolRecord[] }) {
  const map = useMap();
  useEffect(() => {
    if (schools.length === 0) return;
    const bounds = new LatLngBounds(
      schools.map((school) => [school.latitude, school.longitude] as [number, number])
    );
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

export function SchoolMap({
  schools,
  selectedSchoolId,
  onSelectSchool,
  scoreField,
  district,
  province,
  layers,
}: {
  schools: SchoolRecord[];
  selectedSchoolId: string | null;
  onSelectSchool: (schoolId: string | null) => void;
  scoreField: "priority" | "need";
  district: string;
  province?: string;
  layers: LayerToggle[];
}) {
  const [layerState, setLayerState] = useState<LayerState>({
    roads: [],
    air_quality: [],
    access: [],
    flood: null,
    landcover: null,
  });
  const [layerStatus, setLayerStatus] = useState<string>("");
  const [viewportBbox, setViewportBbox] = useState<Bbox4326 | null>(null);
  const [debouncedViewportBbox, setDebouncedViewportBbox] = useState<Bbox4326 | null>(null);
  const cacheRef = useRef<Map<string, LayerCacheValue>>(new Map());

  const activeLayers = useMemo(() => new Set(layers.filter((layer) => layer.active).map((layer) => layer.key)), [layers]);

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
    async (layer: "flood" | "landcover", opacity: number): Promise<RasterMetadataResponse> => {
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
        access: [],
        flood: null,
        landcover: null,
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
        if (activeLayers.has("air_quality")) {
          jobs.push(
            loadVectorLayer("air_quality", VECTOR_LIMIT_DEFAULT).then((response) => {
              next.air_quality = response.items;
            })
          );
        }
        if (activeLayers.has("access")) {
          jobs.push(
            Promise.all([
              loadVectorLayer("pop_access_walk", VECTOR_LIMIT_DEFAULT),
              loadVectorLayer("pop_no_walk", VECTOR_LIMIT_DEFAULT),
              loadVectorLayer("pop_access_cycle", VECTOR_LIMIT_DEFAULT),
              loadVectorLayer("pop_no_cycle", VECTOR_LIMIT_DEFAULT),
              loadVectorLayer("pop_access_drive", VECTOR_LIMIT_DEFAULT),
              loadVectorLayer("pop_no_drive", VECTOR_LIMIT_DEFAULT),
            ]).then((responses) => {
              const allAccess = responses.flatMap((response) => response.items);
              accessThinned = allAccess.length > ACCESS_POINTS_MAX_RENDER;
              next.access = thinByStride(allAccess, ACCESS_POINTS_MAX_RENDER);
            })
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

  return (
    <>
      <MapContainer center={[-6.314993, 147.0]} zoom={6} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitSchools schools={schools} />
        <ViewportBoundsWatcher onChange={setViewportBbox} />

        {activeLayers.has("roads") && layerState.roads.length > 0 ? (
          <GeoJSON
            data={toFeatureCollection(layerState.roads)}
            style={{ color: "#a855f7", weight: 1.1, opacity: 0.75 }}
          />
        ) : null}

        {activeLayers.has("air_quality") && layerState.air_quality.length > 0 ? (
          <GeoJSON
            data={toFeatureCollection(layerState.air_quality)}
            style={{ color: "#059669", weight: 0.8, opacity: 0.75, fillOpacity: 0.16 }}
          />
        ) : null}

        {activeLayers.has("access") && layerState.access.length > 0 ? (
          <GeoJSON
            data={toFeatureCollection(layerState.access)}
            pointToLayer={(_, latlng) =>
              L.circleMarker(latlng, {
                radius: 3,
                color: "#0f766e",
                fillColor: "#0f766e",
                fillOpacity: 0.42,
                weight: 0.6,
              })
            }
          />
        ) : null}

        {activeLayers.has("flood") && layerState.flood ? (
          <ImageOverlay
            url={buildRasterOverlayUrl({
              layer: "flood",
              district,
              province,
              opacity: layerState.flood.opacity,
              format: "png",
            })}
            bounds={rasterBounds(layerState.flood)}
            opacity={layerState.flood.opacity}
          />
        ) : null}

        {activeLayers.has("landcover") && layerState.landcover ? (
          <ImageOverlay
            url={buildRasterOverlayUrl({
              layer: "landcover",
              district,
              province,
              opacity: layerState.landcover.opacity,
              format: "png",
            })}
            bounds={rasterBounds(layerState.landcover)}
            opacity={layerState.landcover.opacity}
          />
        ) : null}

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
                color,
                fillColor: color,
                fillOpacity: isSelected ? 0.92 : 0.72,
                weight: isSelected ? 3 : 1,
              }}
              eventHandlers={{
                click: () => onSelectSchool(school.school_id ?? null),
              }}
            >
              <Popup>
                <strong>{school.school_name}</strong>
                <br />
                {school.district}, {school.province}
                <br />
                Priority: {school.priority != null ? (school.priority * 100).toFixed(1) : "n/a"}
                <br />
                Need: {school.need != null ? (school.need * 100).toFixed(1) : "n/a"}
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
      {layerStatus ? <p className="status-note">{layerStatus}</p> : null}
    </>
  );
}
