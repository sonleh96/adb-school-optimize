"use client";

import { LatLngBounds } from "leaflet";
import { useCallback, useEffect, useMemo } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { PathOptions } from "leaflet";

import { scaleValue } from "@/lib/color";
import { MapScreenshotControl } from "@/components/MapScreenshotControl";
import { districtIndicatorColor, districtIndicatorField } from "@/lib/districtIndicatorPalette";
import type { DistrictRecord } from "@/lib/types";
import type { DistrictScoreField } from "@/lib/districtScores";
import type { MapView } from "@/lib/urlState";

function FitDistricts({ features, enabled }: { features: DistrictRecord[]; enabled: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!enabled) return;
    const bounds = new LatLngBounds([]);
    for (const feature of features) {
      extendBounds(bounds, feature.geometry.coordinates);
    }
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.08));
    }
  }, [enabled, features, map]);

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

function MapViewWatcher({ onChange }: { onChange?: (mapView: MapView) => void }) {
  const map = useMap();
  const publish = useCallback(
    () => onChange?.({ lat: map.getCenter().lat, lng: map.getCenter().lng, zoom: map.getZoom() }),
    [map, onChange]
  );
  useMapEvents({ moveend: publish, zoomend: publish });
  useEffect(() => {
    publish();
  }, [publish]);
  return null;
}

export function DistrictMap({
  features,
  indicator,
  selectedDistrictId,
  onSelectDistrict,
  highlightedDistrictIds = new Set(),
  rankingScoreField = "priority",
  showIndicatorLayer = true,
  mapView = null,
  onMapViewChange,
  hasExplicitMapView = false,
}: {
  features: DistrictRecord[];
  indicator: string;
  selectedDistrictId: string | null;
  onSelectDistrict: (district: DistrictRecord) => void;
  highlightedDistrictIds?: Set<string>;
  rankingScoreField?: DistrictScoreField;
  showIndicatorLayer?: boolean;
  mapView?: MapView | null;
  onMapViewChange?: (mapView: MapView) => void;
  hasExplicitMapView?: boolean;
}) {
  const field = districtIndicatorField(indicator);
  const values = features.map((feature) => Number(feature[field])).filter((value) => Number.isFinite(value));
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;

  const byId = useMemo(() => {
    const map = new Map<string, DistrictRecord>();
    for (const feature of features) map.set(feature.district_id, feature);
    return map;
  }, [features]);

  const collection = useMemo<FeatureCollection<Geometry>>(() => {
    return {
      type: "FeatureCollection",
      features: features.map((feature) => {
        const value = Number(feature[field]);
        return {
          type: "Feature",
          geometry: feature.geometry as unknown as Geometry,
          properties: {
            district_id: feature.district_id,
            district: feature.district,
            province: feature.province,
            value: Number.isFinite(value) ? value : null,
          },
        } satisfies Feature<Geometry>;
      }),
    };
  }, [features, field]);

  const styleFeature = (feature?: Feature<Geometry>): PathOptions => {
    const districtId = String(feature?.properties?.district_id ?? "");
    const value = Number(feature?.properties?.value);
    const normalized = scaleValue(Number.isFinite(value) ? value : null, min, max);
    const fillColor = districtIndicatorColor(indicator, normalized);
    const isSelected = selectedDistrictId === districtId;
    const isHighlighted = highlightedDistrictIds.has(districtId);

    return {
      color: isSelected ? "#17211f" : isHighlighted ? "#a8550a" : "rgba(23, 33, 31, 0.5)",
      weight: isSelected ? 3.2 : isHighlighted ? 2.6 : 1,
      dashArray: isSelected ? undefined : isHighlighted ? "8 4" : undefined,
      fillColor: isHighlighted
        ? districtIndicatorColor(rankingScoreField === "priority" ? "Priority Score" : "Need Score", 1)
        : showIndicatorLayer
          ? fillColor
          : "transparent",
      fillOpacity: isSelected
        ? isHighlighted
          ? 0.82
          : showIndicatorLayer
            ? 0.82
            : 0.06
        : isHighlighted
          ? 0.78
          : showIndicatorLayer
            ? 0.72
            : 0,
    };
  };

  return (
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
      <MapScreenshotControl filenamePrefix="district-explorer-map" />
      <ApplyMapView mapView={mapView} />
      <FitDistricts features={features} enabled={!hasExplicitMapView} />
      <MapViewWatcher onChange={onMapViewChange} />
      {collection.features.length > 0 ? (
        <GeoJSON
          key={`${indicator}-${selectedDistrictId ?? "none"}-${highlightedDistrictIds.size}-${showIndicatorLayer}`}
          data={collection}
          style={styleFeature}
          onEachFeature={(feature, layer) => {
            const districtId = String(feature.properties?.district_id ?? "");
            const record = byId.get(districtId);
            if (!record) return;
            layer.on({
              click: () => onSelectDistrict(record),
            });
          }}
        />
      ) : null}
    </MapContainer>
  );
}

function extendBounds(bounds: LatLngBounds, coordinates: unknown) {
  if (!Array.isArray(coordinates)) return;

  if (coordinates.length >= 2 && typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    bounds.extend([coordinates[1] as number, coordinates[0] as number]);
    return;
  }

  for (const item of coordinates) {
    extendBounds(bounds, item);
  }
}
