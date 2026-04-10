"use client";

import L, { LatLngBounds } from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, GeoJSON, ImageOverlay, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";

import { buildRasterOverlayUrl, fetchLayerFeatures, fetchRasterMetadata } from "@/lib/api";
import { scoreToColor } from "@/lib/color";
import type { RasterMetadataResponse, SchoolRecord, VectorLayerFeature } from "@/lib/types";

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

  const activeLayers = useMemo(() => new Set(layers.filter((layer) => layer.active).map((layer) => layer.key)), [layers]);

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

        if (activeLayers.has("roads")) {
          jobs.push(
            fetchLayerFeatures({ layerKey: "roads", province, district, limit: 120000 }).then((response) => {
              next.roads = response.items;
            })
          );
        }
        if (activeLayers.has("air_quality")) {
          jobs.push(
            fetchLayerFeatures({ layerKey: "air_quality", province, district, limit: 120000 }).then((response) => {
              next.air_quality = response.items;
            })
          );
        }
        if (activeLayers.has("access")) {
          jobs.push(
            Promise.all([
              fetchLayerFeatures({ layerKey: "pop_access_walk", province, district, limit: 120000 }),
              fetchLayerFeatures({ layerKey: "pop_no_walk", province, district, limit: 120000 }),
              fetchLayerFeatures({ layerKey: "pop_access_cycle", province, district, limit: 120000 }),
              fetchLayerFeatures({ layerKey: "pop_no_cycle", province, district, limit: 120000 }),
              fetchLayerFeatures({ layerKey: "pop_access_drive", province, district, limit: 120000 }),
              fetchLayerFeatures({ layerKey: "pop_no_drive", province, district, limit: 120000 }),
            ]).then((responses) => {
              next.access = responses.flatMap((response) => response.items);
            })
          );
        }
        if (activeLayers.has("flood")) {
          jobs.push(
            fetchRasterMetadata({ layer: "flood", district, province, opacity: 0.55 }).then((response) => {
              next.flood = response;
            })
          );
        }
        if (activeLayers.has("landcover")) {
          jobs.push(
            fetchRasterMetadata({ layer: "landcover", district, province, opacity: 0.75 }).then((response) => {
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
          setLayerStatus("");
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
  }, [activeLayers, district, province]);

  return (
    <>
      <MapContainer center={[-6.314993, 147.0]} zoom={6} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitSchools schools={schools} />

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
