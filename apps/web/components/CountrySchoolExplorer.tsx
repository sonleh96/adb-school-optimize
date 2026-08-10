"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CopyLinkButton } from "@/components/CopyLinkButton";
import { BriefingBookmarks } from "@/components/BriefingBookmarks";
import { CompareScoreLegend } from "@/components/CompareScoreLegend";
import { ExportBriefingPackButton } from "@/components/ExportBriefingPackButton";
import { ScoreLegend } from "@/components/ScoreLegend";
import { DistrictScoreLegend } from "@/components/DistrictScoreLegend";
import { SelectionDetailCard } from "@/components/SelectionDetailCard";
import { ErrorState, LoadingSkeleton } from "@/components/states";
import { SchoolFilterControls } from "@/components/SchoolFilterControls";
import { VirtualizedSchoolTable } from "@/components/VirtualizedSchoolTable";
import { useChoroplethQuery, useSchoolDetailQuery, useSchoolsQuery, useScenariosQuery } from "@/lib/hooks";
import { createSchoolFilterPredicate, type SchoolFilters } from "@/lib/schoolFilters";
import { matchingBriefingBookmarkName } from "@/lib/briefingBookmarks";
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
  const [compareMode, setCompareMode] = useState(initialState.compare === "priority-need");
  const [mapView, setMapView] = useState<MapView | null>(initialState.mapView);
  const [scenarioId, setScenarioId] = useState<string | null>(initialState.scenario);
  const [filters, setFilters] = useState<SchoolFilters>(initialState.filters);
  const [mapCapture, setMapCapture] = useState<(() => Promise<Blob>) | null>(null);

  const choroplethQuery = useChoroplethQuery({ fields: "scores", simplifyTolerance: 0.01 });
  const schoolsQuery = useSchoolsQuery({ limit: 10000, scenarioId: scenarioId ?? undefined });
  const scenariosQuery = useScenariosQuery();

  const schools = useMemo(() => schoolsQuery.data ?? [], [schoolsQuery.data]);
  const schoolFilterPredicate = useMemo(() => createSchoolFilterPredicate(filters), [filters]);
  const filteredSchools = useMemo(
    () => schools.filter(schoolFilterPredicate),
    [schools, schoolFilterPredicate]
  );
  const provinces = useMemo(
    () =>
      [...new Set(schools.map((school) => school.province).filter(Boolean))].sort((left, right) =>
        left.localeCompare(right)
      ),
    [schools]
  );
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
    if (selectedSchoolId && filteredSchools.some((school) => school.school_id === selectedSchoolId)) return;
    selectSchool(filteredSchools[0]?.school_id ?? null);
  }, [filteredSchools, selectSchool, selectedSchoolId]);

  useEffect(() => {
    if (!mapView) return;
    const handle = window.setTimeout(() => replaceState({ mapView }), 240);
    return () => window.clearTimeout(handle);
  }, [mapView, replaceState]);

  const detailQuery = useSchoolDetailQuery(selectedSchoolId, scenarioId ?? undefined);

  const selectedSchool = useMemo(
    () => filteredSchools.find((school) => school.school_id === selectedSchoolId) ?? null,
    [filteredSchools, selectedSchoolId]
  );
  const selectedSchoolDetail = detailQuery.data ?? null;
  const scenarioName = useMemo(
    () => scenariosQuery.data?.find((scenario) => scenario.scenario_id === scenarioId)?.scenario_name ?? null,
    [scenarioId, scenariosQuery.data]
  );
  const briefingState = useMemo(
    () =>
      mergeUrlState(initialState, {
        school: selectedSchoolId,
        district: selectedSchool?.district ?? null,
        province: selectedSchool?.province ?? null,
        score: scoreField,
        compare: compareMode ? "priority-need" : null,
        scenario: scenarioId,
        filters,
        layers: [],
        mapView,
      }),
    [compareMode, filters, initialState, mapView, scenarioId, scoreField, selectedSchool, selectedSchoolId]
  );
  const applyBookmark = useCallback(
    (state: UrlState) => {
      setSelectedSchoolId(state.school);
      setScoreField(state.score ?? "priority");
      setCompareMode(state.compare === "priority-need");
      setMapView(state.mapView);
      setScenarioId(state.scenario);
      setFilters(state.filters);
      if (state.scenario) persistSelectedScenario(state.scenario);
      else clearPersistedScenario();
      replaceState(state);
    },
    [replaceState]
  );
  const updateFilters = useCallback(
    (nextFilters: SchoolFilters) => {
      setFilters(nextFilters);
      replaceState({ filters: nextFilters });
    },
    [replaceState]
  );
  const registerMapCapture = useCallback((capture: (() => Promise<Blob>) | null) => {
    setMapCapture(() => capture);
  }, []);

  const getActiveBookmarkName = useCallback(() => {
    try {
      return matchingBriefingBookmarkName("/all-schools", briefingState, window.localStorage);
    } catch {
      return null;
    }
  }, [briefingState]);

  return (
    <div className="map-workspace national-overview-workspace">
      <div className="map-workspace-canvas">
        <div className="map-frame">
          {loading ? (
            <LoadingSkeleton className="absolute inset-0 m-0 rounded-none border-0" lines={4} />
          ) : (
            <SchoolMap
              schools={filteredSchools}
              selectedSchoolId={selectedSchoolId}
              onSelectSchool={selectSchool}
              scoreField={scoreField}
              district="All PNG"
              layers={EMPTY_LAYERS}
              showDistrictProvinceInPopup
              screenshotFilePrefix="all-schools-map"
              districtFeatures={districtFeatures}
              districtScoreField={scoreField}
              comparePriorityAndNeed={compareMode}
              focusSelectedSchool={false}
              mapView={mapView}
              onMapViewChange={setMapView}
              hasExplicitMapView={initialState.mapView != null}
              enableNationalDensity
              onMapCaptureReady={registerMapCapture}
            />
          )}
        </div>
      </div>

      <div className="map-overlay-controls map-overlay-controls-top-left national-overview-controls">
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
        <button
          type="button"
          className={`score-toggle-button compare-mode-button ${compareMode ? "is-active" : ""}`}
          aria-pressed={compareMode}
          onClick={() => {
            const nextCompareMode = !compareMode;
            setCompareMode(nextCompareMode);
            replaceState({ compare: nextCompareMode ? "priority-need" : null });
          }}
        >
          Compare Priority + Need
        </button>
        {compareMode ? <CompareScoreLegend className="compare-score-legend-compact" /> : null}
        <CopyLinkButton state={briefingState} />
        <ExportBriefingPackButton
          captureMap={mapCapture}
          schools={filteredSchools}
          scoreField={scoreField}
          filters={filters}
          scenarioId={scenarioId}
          scenarioName={scenarioName}
          selectedSchool={selectedSchool}
          getActiveBookmarkName={getActiveBookmarkName}
        />
        <BriefingBookmarks currentState={briefingState} onApply={applyBookmark} />
      </div>

      <div className="map-overlay-legend">
        <div className="map-legend-block">
          {compareMode ? <CompareScoreLegend /> : <ScoreLegend scoreField={scoreField} />}
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
              <p className="float-panel-subtitle">Nationwide Priority and Need, filtered locally</p>
            </div>
          </div>
          <SchoolFilterControls
            filters={filters}
            provinces={provinces}
            resultCount={filteredSchools.length}
            onChange={updateFilters}
          />
          <div className="float-panel-body" style={{ padding: 0 }}>
            {error ? (
              <ErrorState message="Could not load schools." className="m-3" />
            ) : filteredSchools.length === 0 ? (
              <div className="p-5" role="status">
                <p className="text-sm font-medium text-[var(--color-ink)]">No schools match these filters.</p>
                <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">
                  Remove a filter or lower a score threshold to see schools on the map and in this table.
                </p>
              </div>
            ) : (
              <VirtualizedSchoolTable
                schools={filteredSchools}
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
