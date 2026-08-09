"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import { CopyLinkButton } from "@/components/CopyLinkButton";
import { ScoreLegend } from "@/components/ScoreLegend";
import { VirtualizedSchoolTable } from "@/components/VirtualizedSchoolTable";
import { useDistrictOptionsQuery, useSchoolDetailQuery, useSchoolsQuery } from "@/lib/hooks";
import type { SchoolRecord } from "@/lib/types";
import type { SchoolLayerKey, SchoolLayerToggle } from "@/components/SchoolMap";
import { mergeUrlState, useShareableUrlState, type MapView } from "@/lib/urlState";
import { getPersistedScenario, persistSelectedScenario } from "@/lib/scenarioSelection";

const SchoolMap = dynamic(() => import("@/components/SchoolMap").then((mod) => mod.SchoolMap), {
  ssr: false,
  loading: () => <div className="loading absolute inset-0">Loading school map…</div>,
});

const DEFAULT_DISTRICT = "National Capital District";

const INITIAL_LAYERS: SchoolLayerToggle[] = [
  { key: "roads", label: "Road segments", active: false },
  { key: "air_quality_mean", label: "Average AQI", active: false },
  { key: "air_quality_max", label: "Maximum AQI", active: false },
  { key: "access_walk", label: "Population Access (Walking - 4km)", active: false },
  { key: "access_cycle", label: "Population Access (Cycling - 7km)", active: false },
  { key: "access_drive", label: "Population Access (Driving - 10km)", active: false },
  { key: "landcover", label: "Land cover", active: false },
  { key: "flood", label: "Flood inundation", active: false },
  { key: "elevation", label: "Elevation", active: false },
  { key: "luminosity", label: "Nighttime Luminosity", active: false },
];

function rankSuggestion(value: string, query: string): number {
  const candidate = value.trim().toLowerCase();
  if (!query) return 4;
  if (candidate === query) return 0;
  if (candidate.startsWith(query)) return 1;
  if (candidate.split(/\s+/).some((token) => token.startsWith(query))) return 2;
  if (candidate.includes(query)) return 3;
  return 9;
}

export function SchoolExplorer() {
  const { initialState, replaceState } = useShareableUrlState();
  const [district, setDistrict] = useState(initialState.district ?? DEFAULT_DISTRICT);
  const [districtQuery, setDistrictQuery] = useState(initialState.district ?? DEFAULT_DISTRICT);
  const [showDistrictSuggestions, setShowDistrictSuggestions] = useState(false);
  const [schoolQuery, setSchoolQuery] = useState("");
  const [showSchoolSuggestions, setShowSchoolSuggestions] = useState(false);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(initialState.school);
  const [scoreField, setScoreField] = useState<"priority" | "need">(initialState.score ?? "priority");
  const [layers, setLayers] = useState<SchoolLayerToggle[]>(() =>
    INITIAL_LAYERS.map((layer) => ({ ...layer, active: initialState.layers.includes(layer.key) }))
  );
  const [mapView, setMapView] = useState<MapView | null>(initialState.mapView);
  const [province, setProvince] = useState<string | null>(initialState.province);
  const [scenarioId, setScenarioId] = useState<string | null>(initialState.scenario);

  const districtOptionsQuery = useDistrictOptionsQuery();
  const schoolsQuery = useSchoolsQuery({ limit: 10000, scenarioId: scenarioId ?? undefined });

  const districtOptions = useMemo(() => districtOptionsQuery.data ?? [], [districtOptionsQuery.data]);
  const schoolSearchOptions = useMemo(() => schoolsQuery.data ?? [], [schoolsQuery.data]);
  const errorMessage =
    (districtOptionsQuery.error instanceof Error && districtOptionsQuery.error.message) ||
    (schoolsQuery.error instanceof Error && schoolsQuery.error.message) ||
    null;
  const loading = schoolsQuery.isLoading;

  const schools = useMemo(
    () =>
      schoolSearchOptions.filter(
        (school) => school.district === district && (!province || school.province === province)
      ),
    [district, province, schoolSearchOptions]
  );

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

  const selectedSchoolFromSearch = useMemo(
    () => schoolSearchOptions.find((school) => school.school_id === selectedSchoolId) ?? null,
    [schoolSearchOptions, selectedSchoolId]
  );

  const selectedDistrictOption = useMemo(
    () =>
      districtOptions.find(
        (option) => option.district === district && (!province || option.province === province)
      ) ?? null,
    [districtOptions, district, province]
  );
  const selectedProvince = province ?? selectedDistrictOption?.province;

  useEffect(() => {
    if (!selectedSchoolFromSearch || selectedSchoolFromSearch.district === district) return;
    setDistrict(selectedSchoolFromSearch.district);
    setDistrictQuery(selectedSchoolFromSearch.district);
    setProvince(selectedSchoolFromSearch.province);
    replaceState({
      school: selectedSchoolFromSearch.school_id ?? null,
      district: selectedSchoolFromSearch.district,
      province: selectedSchoolFromSearch.province,
    });
  }, [district, replaceState, selectedSchoolFromSearch]);

  useEffect(() => {
    if (!districtOptions.length || districtOptions.some((row) => row.district === district)) return;
    const fallback = districtOptions.find((row) => row.district === DEFAULT_DISTRICT) ?? districtOptions[0];
    if (!fallback) return;
    setDistrict(fallback.district);
    setDistrictQuery(fallback.district);
    setProvince(fallback.province);
    replaceState({ district: fallback.district, province: fallback.province, school: null });
  }, [district, districtOptions, replaceState]);

  useEffect(() => {
    if (selectedSchoolId && selectedSchoolFromSearch && selectedSchoolFromSearch.district !== district)
      return;
    if (!selectedSchoolId && schools[0]?.school_id) {
      setSelectedSchoolId(schools[0].school_id);
      replaceState({
        school: schools[0].school_id,
        district: schools[0].district,
        province: schools[0].province,
      });
      return;
    }
    if (selectedSchoolId && !schools.some((school) => school.school_id === selectedSchoolId)) {
      setSelectedSchoolId(schools[0]?.school_id ?? null);
      replaceState({
        school: schools[0]?.school_id ?? null,
        district: schools[0]?.district ?? district,
        province: schools[0]?.province ?? selectedProvince ?? null,
      });
    }
  }, [district, replaceState, schools, selectedProvince, selectedSchoolFromSearch, selectedSchoolId]);

  const detailQuery = useSchoolDetailQuery(selectedSchoolId, scenarioId ?? undefined);

  const selectedSchoolDetail = detailQuery.data ?? null;

  const selectedSchool = useMemo(
    () => schools.find((school) => school.school_id === selectedSchoolId) ?? null,
    [schools, selectedSchoolId]
  );

  useEffect(() => {
    if (!selectedSchool) return;
    setSchoolQuery(selectedSchool.school_name);
  }, [selectedSchool]);

  const districtSuggestions = useMemo(() => {
    const query = districtQuery.trim().toLowerCase();
    const directionalRank = (name: string): number => {
      const value = name.trim().toLowerCase();
      if (value.startsWith("north ")) return 0;
      if (value.startsWith("middle ")) return 1;
      if (value.startsWith("south ")) return 2;
      return 9;
    };

    return districtOptions
      .map((option) => ({
        option,
        score: rankSuggestion(option.district, query),
        dir: directionalRank(option.district),
      }))
      .filter((item) => item.score < 9)
      .sort(
        (left, right) =>
          left.score - right.score ||
          left.dir - right.dir ||
          left.option.district.localeCompare(right.option.district)
      )
      .slice(0, 8)
      .map((item) => item.option);
  }, [districtOptions, districtQuery]);

  const schoolSuggestions = useMemo(() => {
    const query = schoolQuery.trim().toLowerCase();
    return schoolSearchOptions
      .map((school) => ({ school, score: rankSuggestion(school.school_name, query) }))
      .filter((item) => item.score < 9)
      .sort((left, right) => {
        if (left.score !== right.score) return left.score - right.score;
        return left.school.school_name.localeCompare(right.school.school_name);
      })
      .slice(0, 8)
      .map((item) => item.school);
  }, [schoolQuery, schoolSearchOptions]);

  const applyDistrict = (option: { district: string; province: string }) => {
    const nextSchool =
      schoolSearchOptions.find(
        (school) => school.district === option.district && school.province === option.province
      ) ?? null;
    setDistrict(option.district);
    setDistrictQuery(option.district);
    setProvince(nextSchool?.province ?? option.province);
    setSelectedSchoolId(nextSchool?.school_id ?? null);
    replaceState({
      district: option.district,
      province: nextSchool?.province ?? option.province,
      school: nextSchool?.school_id ?? null,
    });
    setShowDistrictSuggestions(false);
  };

  const applySchool = (school: SchoolRecord) => {
    setSchoolQuery(school.school_name);
    setShowSchoolSuggestions(false);
    setDistrict(school.district);
    setDistrictQuery(school.district);
    setProvince(school.province);
    setSelectedSchoolId(school.school_id ?? null);
    replaceState({ school: school.school_id ?? null, district: school.district, province: school.province });
  };

  const toggleLayer = (layerKey: SchoolLayerKey) => {
    const isAirLayer = layerKey === "air_quality_mean" || layerKey === "air_quality_max";
    const nextLayers = layers.map((layer) => {
      if (layer.key === layerKey) return { ...layer, active: !layer.active };
      if (!isAirLayer) return layer;
      if (layer.key === "air_quality_mean" || layer.key === "air_quality_max") {
        return { ...layer, active: false };
      }
      return layer;
    });
    setLayers(nextLayers);
    replaceState({ layers: nextLayers.filter((layer) => layer.active).map((layer) => layer.key) });
  };

  useEffect(() => {
    if (!mapView) return;
    const handle = window.setTimeout(() => replaceState({ mapView }), 240);
    return () => window.clearTimeout(handle);
  }, [mapView, replaceState]);

  const layerColumns = useMemo(() => {
    const midpoint = Math.ceil(layers.length / 2);
    return [layers.slice(0, midpoint), layers.slice(midpoint)];
  }, [layers]);

  return (
    <div className="map-workspace">
      <div className="map-workspace-canvas">
        <div className="map-frame">
          {loading ? (
            <div className="loading absolute inset-0">Loading schools…</div>
          ) : (
            <SchoolMap
              schools={schools}
              selectedSchoolId={selectedSchoolId}
              onSelectSchool={setSelectedSchoolId}
              scoreField={scoreField}
              district={district}
              province={selectedProvince}
              layers={layers}
              showDistrictProvinceInPopup={false}
              screenshotFilePrefix="school-explorer-map"
              mapView={mapView}
              onMapViewChange={setMapView}
              hasExplicitMapView={initialState.mapView != null}
            />
          )}
        </div>
      </div>

      <div className="map-overlay-controls map-overlay-controls-top-left">
        <p className="overlay-title">School explorer</p>
        <p className="overlay-copy">Search and inspect a district slice.</p>
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
        <CopyLinkButton
          state={mergeUrlState(initialState, {
            school: selectedSchoolId,
            district,
            province: selectedProvince ?? initialState.province,
            score: scoreField,
            scenario: scenarioId,
            layers: layers.filter((layer) => layer.active).map((layer) => layer.key),
            mapView,
          })}
        />
        <div className="district-search map-district-search">
          <input
            id="school-search"
            type="text"
            value={schoolQuery}
            placeholder="Search school…"
            onFocus={() => setShowSchoolSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSchoolSuggestions(false), 120)}
            onChange={(event) => {
              setSchoolQuery(event.target.value);
              setShowSchoolSuggestions(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && schoolSuggestions[0]) {
                event.preventDefault();
                applySchool(schoolSuggestions[0]);
              }
            }}
          />
          {showSchoolSuggestions && schoolSuggestions.length > 0 ? (
            <div className="district-suggestions">
              {schoolSuggestions.map((school) => (
                <button
                  type="button"
                  key={school.school_id ?? `${school.school_name}-${school.latitude}-${school.longitude}`}
                  className="district-suggestion-item"
                  onMouseDown={() => applySchool(school)}
                >
                  {school.school_name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="district-search map-district-search">
          <input
            id="district-search"
            type="text"
            value={districtQuery}
            placeholder="Search district…"
            onFocus={() => setShowDistrictSuggestions(true)}
            onBlur={() => setTimeout(() => setShowDistrictSuggestions(false), 120)}
            onChange={(event) => {
              setDistrictQuery(event.target.value);
              setShowDistrictSuggestions(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && districtSuggestions[0]) {
                event.preventDefault();
                applyDistrict(districtSuggestions[0]);
              }
            }}
          />
          {showDistrictSuggestions && districtSuggestions.length > 0 ? (
            <div className="district-suggestions">
              {districtSuggestions.map((option) => (
                <button
                  type="button"
                  key={option.district_id}
                  className="district-suggestion-item"
                  onMouseDown={() => applyDistrict(option)}
                >
                  {option.district}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <ScoreLegend scoreField={scoreField} />
        {errorMessage ? (
          <p className="overlay-copy" style={{ color: "var(--color-danger)" }}>
            {errorMessage}
          </p>
        ) : null}
      </div>

      <aside className="float-panel map-overlay-layers" aria-label="Layer control">
        <div className="float-panel-head">
          <div>
            <h2 className="float-panel-title">Layers</h2>
            <p className="float-panel-subtitle">AQI mean/max are exclusive</p>
          </div>
        </div>
        <div className="float-panel-body">
          <div className="layer-control-columns">
            <div className="layer-control-column">
              <label className="layer-control-item layer-control-item-fixed">
                <input type="checkbox" checked disabled />
                <span>Schools</span>
              </label>
              {layerColumns[0].map((layer) => (
                <label className="layer-control-item" key={layer.key}>
                  <input type="checkbox" checked={layer.active} onChange={() => toggleLayer(layer.key)} />
                  <span>{layer.label}</span>
                </label>
              ))}
            </div>
            <div className="layer-control-column">
              {layerColumns[1].map((layer) => (
                <label className="layer-control-item" key={layer.key}>
                  <input type="checkbox" checked={layer.active} onChange={() => toggleLayer(layer.key)} />
                  <span>{layer.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <aside className="map-side-panel" aria-label="School table and snapshot">
        <article className="float-panel map-side-panel-primary">
          <div className="float-panel-head">
            <div>
              <h2 className="float-panel-title">Ranked schools</h2>
              <p className="float-panel-subtitle">{district}</p>
            </div>
          </div>
          <div className="float-panel-body" style={{ padding: 0 }}>
            <VirtualizedSchoolTable
              schools={schools}
              selectedSchoolId={selectedSchoolId}
              onSelectSchool={setSelectedSchoolId}
            />
          </div>
        </article>

        <article className="float-panel map-side-panel-secondary">
          <div className="float-panel-head">
            <div>
              <h2 className="float-panel-title">Selection</h2>
              <p className="float-panel-subtitle">Decision-ready snapshot</p>
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
                  <h4>Locality</h4>
                  <p>{String(selectedSchoolDetail?.locality ?? selectedSchool.locality ?? "n/a")}</p>
                </div>
                <div className="detail-card">
                  <h4>Teachers / Classrooms</h4>
                  <p>
                    {String(selectedSchoolDetail?.number_of_available_teachers ?? "n/a")} /{" "}
                    {String(selectedSchoolDetail?.total_number_of_classrooms ?? "n/a")}
                  </p>
                </div>
                <div className="detail-card">
                  <h4>Walking access</h4>
                  <p>{formatPercentMetric(selectedSchoolDetail?.access_walking_pct)}</p>
                </div>
                <div className="detail-card">
                  <h4>Enrollment 7-10</h4>
                  <p>{formatNumericMetric(selectedSchoolDetail?.total_enrollment_grade_7_10, 0)}</p>
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

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function formatNumericMetric(value: unknown, digits = 1): string {
  const numeric = toFiniteNumber(value);
  if (numeric == null) return "n/a";
  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPercentMetric(value: unknown): string {
  const numeric = toFiniteNumber(value);
  if (numeric == null) return "n/a";
  const percent = numeric <= 1 ? numeric * 100 : numeric;
  return `${percent.toFixed(1)}%`;
}
