"use client";

import { LatLngBounds } from "leaflet";
import { useEffect } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";

import { scoreToColor } from "@/lib/color";
import type { SchoolRecord } from "@/lib/types";

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

export function SchoolMap({
  schools,
  selectedSchoolId,
  onSelectSchool,
  scoreField,
}: {
  schools: SchoolRecord[];
  selectedSchoolId: string | null;
  onSelectSchool: (schoolId: string) => void;
  scoreField: "priority" | "need";
}) {
  return (
    <MapContainer center={[-6.314993, 147.0]} zoom={6} scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitSchools schools={schools} />
      {schools.map((school) => {
        const score = scoreField === "priority" ? school.priority : school.need;
        const color = scoreToColor(score);
        const isSelected = school.school_id === selectedSchoolId;

        return (
          <CircleMarker
            key={school.school_id}
            center={[school.latitude, school.longitude]}
            radius={isSelected ? 10 : 7}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: isSelected ? 0.92 : 0.72,
              weight: isSelected ? 3 : 1,
            }}
            eventHandlers={{
              click: () => onSelectSchool(school.school_id),
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
  );
}
