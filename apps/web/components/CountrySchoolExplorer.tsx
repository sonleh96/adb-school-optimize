"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CopyLinkButton } from "@/components/CopyLinkButton";
import { BriefingBookmarks } from "@/components/BriefingBookmarks";
import { ScoreLegend } from "@/components/ScoreLegend";
import { DistrictScoreLegend } from "@/components/DistrictScoreLegend";
import { SelectionDetailCard } from "@/components/SelectionDetailCard";
import { ErrorState, LoadingSkeleton } from "@/components/states";
import { VirtualizedSchoolTable } from "@/components/VirtualizedSchoolTable";
import { useChoroplethQuery, useSchoolDetailQuery, useSchoolsQuery } from "@/lib/hooks";
import type { SchoolLayerToggle } from "@/components/SchoolMap";
import { mergeUrlState, useShareableUrlState, type MapView, type UrlState } from "@/lib/urlState";
import {
  clearPersistedScenario,
  getPersistedScenario,
  persistSelectedScenario,
} from "@/lib/scenarioSelection";

const SchoolMap = dynamic(() => import("@/components/SchoolMap").then((mod) => mod.SchoolMap), {
  ssr: false,
  loading: () => <LoadingSkeleton className="absolute inset-0 m-0 rounded-none border-0" lines={4} />,
});

const EMPTY_LAYERS: SchoolLayerToggle[] = [];

export function CountrySchoolExplorer() {
  const { initialState, replaceState } = useShareableUrlState();
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(initialState.school);
  const [scoreField, setScoreField] = useState<"priority" | "need">(initialState.score ?? "priority");
  const [mapView, setMapView] = useState<MapView | null>(initialState.mapView);
  const [scenarioId, setScenarioId] = useState<string | null>(initialState.scenario);

  const choroplethQuery = useChoroplethQuery({ fields: "scores" });
  const schoolsQuery = useSchoolsQuery({ limit: 10000, scenarioId: scenarioId ?? undefined });

  const schools = useMemo(() => schoolsQuery.data ?? [], [schoolsQuery.data]);
  const districtFeatures = useMemo(
    () => choroplethQuery.data?.features ?? [],
    [choroplethQuery.data?.features]
  );
  const error = schoolsQuery.error ?? choroplethQuery.error;
  const loading = schoolsQuery.isLoading;

  useEffect(() => {
    if (initialState.scenario) {
      setScenarioId(initialState.scenario);
      persistSelectedScenario(initialState.scenario);
      return;
    }
    const persistedScenario = getPersistedScenario();
    if (!persistedScenario) return;
    setScenarioId(persistedScenario);
    replaceState({ scenario: persistedScenario });
  }, [initialState.scenario, replaceState]);

  const selectSchool = useCallback(
    (schoolId: string | null) => {
      const school = schools.find((item) => item.school_id === schoolId);
      setSelectedSchoolId(schoolId);
      replaceState({
        school: schoolId,
        district: school?.district ?? null,
        province: school?.province ?? null,
      });
    },
    [replaceState, schools]
  );

  useEffect(() => {
    if (selectedSchoolId || !schools[0]?.school_id) return;
    selectSchool(schools[0].school_id);
  }, [selectSchool, selectedSchoolId, schools]);

  useEffect(() => {
    if (!mapView) return;
    const handle = window.setTimeout(() => replaceState({ mapView }), 240);
    return () => window.clearTimeout(handle);
  }, [mapView, replaceState]);

  const detailQuery = useSchoolDetailQuery(selectedSchoolId, scenarioId ?? undefined);

  const selectedSchool = useMemo(
    () => schools.find((school) => school.school_id === selectedSchoolId) ?? null,
    [schools, selectedSchoolId]
  );
  const selectedSchoolDetail = detailQuery.data ?? null;
  const briefingState = useMemo(
    () =>
      mergeUrlState(initialState, {
        school: selectedSchoolId,
        district: selectedSchool?.district ?? null,
        province: selectedSchool?.province ?? null,
        score: scoreField,
        scenario: scenarioId,
        layers: [],
        mapView,
      }),
    [initialState, mapView, scenarioId, scoreField, selectedSchool, selectedSchoolId]
  );
  const applyBookmark = useCallback(
    (state: UrlState) => {
      setSelectedSchoolId(state.school);
      setScoreField(state.score ?? "priority");
      setMapView(state.mapView);
      setScenarioId(state.scenario);
      if (state.scenario) persistSelectedScenario(state.scenario);
      else clearPersistedScenario();
      replaceState(state);
    },
    [replaceState]
  );

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
              onSelectSchool={selectSchool}
              scoreField={scoreField}
              district="All PNG"
              layers={EMPTY_LAYERS}
              showDistrictProvinceInPopup
              screenshotFilePrefix="all-schools-map"
              districtFeatures={districtFeatures}
              districtScoreField={scoreField}
              focusSelectedSchool={false}
              mapView={mapView}
              onMapViewChange={setMapView}
              hasExplicitMapView={initialState.mapView != null}
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
            onClick={() => {
              setScoreField("priority");
              replaceState({ score: "priority" });
            }}
          >
            Priority
          </button>
          <button
            type="button"
            className={`score-toggle-button ${scoreField === "need" ? "is-active" : ""}`}
            onClick={() => {
              setScoreField("need");
              replaceState({ score: "need" });
            }}
          >
            Need
          </button>
        </div>
        <CopyLinkButton state={briefingState} />
        <BriefingBookmarks currentState={briefingState} onApply={applyBookmark} />
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
                onSelectSchool={selectSchool}
              />
            )}
          </div>
        </article>

        <SelectionDetailCard
          className="map-side-panel-secondary"
          kind="school"
          school={selectedSchool}
          detail={selectedSchoolDetail}
          schools={schools}
          scenarioId={scenarioId}
          isLoading={schoolsQuery.isLoading || detailQuery.isLoading}
          errorMessage={
            schoolsQuery.error
              ? "Schools could not be loaded."
              : detailQuery.error
                ? "School details could not be loaded."
                : null
          }
          onRetry={() => void (schoolsQuery.error ? schoolsQuery.refetch() : detailQuery.refetch())}
        />
      </aside>
    </div>
  );
}
