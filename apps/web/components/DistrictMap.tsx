"use client";

import { LatLngBounds } from "leaflet";
import { useEffect } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import type { Feature, Geometry } from "geojson";

import { scaleValue } from "@/lib/color";
import { districtIndicatorColor, districtIndicatorField } from "@/lib/districtIndicatorPalette";
import type { DistrictRecord } from "@/lib/types";

function FitDistricts({ features }: { features: DistrictRecord[] }) {
  const map = useMap();
  useEffect(() => {
    const bounds = new LatLngBounds([]);
    for (const feature of features) {
      extendBounds(bounds, feature.geometry.coordinates);
    }
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.08));
    }
  }, [features, map]);

  return null;
}

export function DistrictMap({
  features,
  indicator,
  selectedDistrictId,
  onSelectDistrict,
}: {
  features: DistrictRecord[];
  indicator: string;
  selectedDistrictId: string | null;
  onSelectDistrict: (district: DistrictRecord) => void;
}) {
  const field = districtIndicatorField(indicator);
  const values = features
    .map((feature) => Number(feature[field]))
    .filter((value) => Number.isFinite(value));
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;

  return (
    <MapContainer center={[-6.314993, 147.0]} zoom={6} scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitDistricts features={features} />
      {features.map((feature) => {
        const value = Number(feature[field]);
        const normalized = scaleValue(Number.isFinite(value) ? value : null, min, max);
        const fillColor = districtIndicatorColor(indicator, normalized);
        const isSelected = selectedDistrictId === feature.district_id;
        const geoJsonFeature: Feature<Geometry> = {
          type: "Feature",
          geometry: feature.geometry as unknown as Geometry,
          properties: {
            district: feature.district,
            province: feature.province,
            value,
          },
        };

        return (
          <GeoJSON
            key={feature.district_id}
            data={geoJsonFeature}
            style={{
              color: isSelected ? "#17211f" : "rgba(23, 33, 31, 0.5)",
              weight: isSelected ? 2.8 : 1,
              fillColor,
              fillOpacity: 0.72,
            }}
            eventHandlers={{
              click: () => onSelectDistrict(feature),
            }}
          />
        );
      })}
    </MapContainer>
  );
}

function extendBounds(bounds: LatLngBounds, coordinates: unknown) {
  if (!Array.isArray(coordinates)) return;

  if (
    coordinates.length >= 2 &&
    typeof coordinates[0] === "number" &&
    typeof coordinates[1] === "number"
  ) {
    bounds.extend([coordinates[1] as number, coordinates[0] as number]);
    return;
  }

  for (const item of coordinates) {
    extendBounds(bounds, item);
  }
}
