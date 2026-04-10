"use client";

import { LatLngBounds } from "leaflet";
import { useEffect } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import type { Feature, Geometry } from "geojson";

import { choroplethColor, scaleValue } from "@/lib/color";
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
  const field = indicatorToField(indicator);
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
        const fillColor = choroplethColor(normalized);
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

function indicatorToField(indicator: string): string {
  const mapping: Record<string, string> = {
    "Average AQI": "average_aqi",
    "Maximum AQI": "maximum_aqi",
    "Fixed Broadband Download Speed (MB/s)": "fixed_broadband_download_speed_mbps",
    "Fixed Broadband Upload Speed (MB/s)": "fixed_broadband_upload_speed_mbps",
    "Mobile Internet Download Speed (MB/s)": "mobile_internet_download_speed_mbps",
    "Mobile Internet Upload Speed (MB/s)": "mobile_internet_upload_speed_mbps",
    "Access Walking (%)": "access_walking_pct",
    "Access Driving (%)": "access_driving_pct",
    "Access Cycling (%)": "access_cycling_pct",
    "Total Nighttime Luminosity": "total_nighttime_luminosity",
    "Secondary students per 1000 people": "secondary_students_per_1000_people",
    "Rate of Grade 7 who progressed to Grade 10 (%)": "rate_grade_7_progressed_to_grade_10_pct",
    "Conflict Events": "conflict_events",
    "Conflict Fatalities": "conflict_fatalities",
    "Conflict Population Exposure": "conflict_population_exposure",
  };
  return mapping[indicator] ?? "average_aqi";
}
