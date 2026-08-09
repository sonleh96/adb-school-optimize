"use client";

import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { fetchDistrictChoropleth, fetchSchoolDetail, fetchSchools } from "@/lib/api";
import { ScoreLegend } from "@/components/ScoreLegend";
import { DistrictScoreLegend } from "@/components/DistrictScoreLegend";
import { ErrorState, LoadingSkeleton } from "@/components/states";
import { VirtualizedSchoolTable } from "@/components/VirtualizedSchoolTable";
import { queryKeys } from "@/lib/queryKeys";
import type { SchoolLayerToggle } from "@/components/SchoolMap";

const SchoolMap = dynamic(() => import("@/components/SchoolMap").then((mod) => mod.SchoolMap), {
  ssr: false,
  loading: () => <LoadingSkeleton className="absolute inset-0 m-0 rounded-none border-0" lines={4} />,
});

const EMPTY_LAYERS: SchoolLayerToggle[] = [];

export function CountrySchoolExplorer() {
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
  const [scoreField, setScoreField] = useState<"priority" | "need">("priority");

  const choroplethQuery = useQuery({
    queryKey: queryKeys.choropleth({ fields: "scores" }),
    queryFn: () => fetchDistrictChoropleth({ fields: "scores" }),
  });

  const schoolsQuery = useQuery({
    queryKey: queryKeys.schools({ limit: 10000 }),
    queryFn: () => fetchSchools({ limit: 10000 }),
  });

  const schools = useMemo(() => schoolsQuery.data ?? [], [schoolsQuery.data]);
  const districtFeatures = useMemo(
    () => choroplethQuery.data?.features ?? [],
    [choroplethQuery.data?.features],
  );
  const error = schoolsQuery.error ?? choroplethQuery.error;
  const loading = schoolsQuery.isLoading;

  useEffect(() => {
    if (!selectedSchoolId && schools[0]?.school_id) {
      setSelectedSchoolId(schools[0].school_id);
    }
  }, [schools, selectedSchoolId]);

  const detailQuery = useQuery({
    queryKey: queryKeys.schoolDetail(selectedSchoolId ?? ""),
    queryFn: () => fetchSchoolDetail(selectedSchoolId!),
    enabled: Boolean(selectedSchoolId),
  });

  const selectedSchool = useMemo(
    () => schools.find((school) => school.school_id === selectedSchoolId) ?? null,
    [schools, selectedSchoolId],
  );
  const selectedSchoolDetail = detailQuery.data ?? null;

  return (
    <div className="map-workspace">
      <div className="map-workspace-canvas">
        <div className="map-frame">
          {loading ? (
            <LoadingSkeleton className="absolute inset-0 m-0 rounded-none border-0" lines={4} />
          ) : (
            <SchoolMap
              schools={schools}
              selectedSchoolId={selectedSchoolId}
              onSelectSchool={setSelectedSchoolId}
              scoreField={scoreField}
              district="All PNG"
              layers={EMPTY_LAYERS}
              showDistrictProvinceInPopup
              screenshotFilePrefix="all-schools-map"
              districtFeatures={districtFeatures}
              districtScoreField={scoreField}
              focusSelectedSchool={false}
            />
          )}
        </div>
      </div>

      <div className="map-overlay-controls map-overlay-controls-top-left">
        <p className="overlay-title">National overview</p>
        <p className="overlay-copy">Click a marker to sync the ranked table.</p>
        <div className="score-toggle" role="group" aria-label="Color markers by">
          <button
            type="button"
            className={`score-toggle-button ${scoreField === "priority" ? "is-active" : ""}`}
            onClick={() => setScoreField("priority")}
          >
            Priority
          </button>
          <button
            type="button"
            className={`score-toggle-button ${scoreField === "need" ? "is-active" : ""}`}
            onClick={() => setScoreField("need")}
          >
            Need
          </button>
        </div>
      </div>

      <div className="map-overlay-legend">
        <div className="map-legend-block">
          <ScoreLegend scoreField={scoreField} />
        </div>
        <div className="map-legend-block">
          <DistrictScoreLegend scoreField={scoreField} />
        </div>
      </div>

      <aside className="map-side-panel" aria-label="School ranking and snapshot">
        <article className="float-panel map-side-panel-primary">
          <div className="float-panel-head">
            <div>
              <h2 className="float-panel-title">Ranked schools</h2>
              <p className="float-panel-subtitle">Nationwide Priority and Need</p>
            </div>
          </div>
          <div className="float-panel-body" style={{ padding: 0 }}>
            {error ? (
              <ErrorState message="Could not load schools." className="m-3" />
            ) : (
              <VirtualizedSchoolTable
                schools={schools}
                selectedSchoolId={selectedSchoolId}
                onSelectSchool={setSelectedSchoolId}
              />
            )}
          </div>
        </article>

        <article className="float-panel map-side-panel-secondary">
          <div className="float-panel-head">
            <div>
              <h2 className="float-panel-title">Selection</h2>
              <p className="float-panel-subtitle">Map or table pick</p>
            </div>
          </div>
          <div className="float-panel-body">
            {selectedSchool ? (
              <div className="detail-grid detail-grid-compact">
                <div className="detail-card">
                  <h4>{selectedSchool.school_name}</h4>
                  <p>
                    {selectedSchool.district}, {selectedSchool.province}
                  </p>
                </div>
                <div className="detail-card">
                  <h4>Priority / Need</h4>
                  <p>
                    {selectedSchool.priority != null ? (selectedSchool.priority * 100).toFixed(1) : "n/a"} /{" "}
                    {selectedSchool.need != null ? (selectedSchool.need * 100).toFixed(1) : "n/a"}
                  </p>
                </div>
                <div className="detail-card">
                  <h4>Teachers / Classrooms</h4>
                  <p>
                    {String(selectedSchoolDetail?.number_of_available_teachers ?? "n/a")} /{" "}
                    {String(selectedSchoolDetail?.total_number_of_classrooms ?? "n/a")}
                  </p>
                </div>
                <div className="detail-card">
                  <h4>Confidence / Stage 1</h4>
                  <p>
                    {selectedSchool.data_confidence != null
                      ? `${(selectedSchool.data_confidence * 100).toFixed(0)}%`
                      : "n/a"}{" "}
                    / {selectedSchool.stage1_selected ? "Selected" : "Not selected"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="overlay-copy">Pick a school on the map or in the table.</p>
            )}
          </div>
        </article>
      </aside>
    </div>
  );
}
