"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import { fetchDistrictOptions, fetchSchoolDetail, fetchSchools } from "@/lib/api";
import { scoreToPillStyle } from "@/lib/color";
import { ScoreLegend } from "@/components/ScoreLegend";
import type { SchoolRecord } from "@/lib/types";
import type { SchoolLayerKey, SchoolLayerToggle } from "@/components/SchoolMap";

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
  const [district, setDistrict] = useState(DEFAULT_DISTRICT);
  const [districtQuery, setDistrictQuery] = useState(DEFAULT_DISTRICT);
  const [showDistrictSuggestions, setShowDistrictSuggestions] = useState(false);
  const [districtOptions, setDistrictOptions] = useState<
    Array<{ district_id: string; province: string; district: string }>
  >([]);
  const [schoolQuery, setSchoolQuery] = useState("");
  const [showSchoolSuggestions, setShowSchoolSuggestions] = useState(false);
  const [schoolSearchOptions, setSchoolSearchOptions] = useState<SchoolRecord[]>([]);
  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
  const [selectedSchoolDetail, setSelectedSchoolDetail] = useState<Record<string, unknown> | null>(null);
  const [scoreField, setScoreField] = useState<"priority" | "need">("priority");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [layers, setLayers] = useState<SchoolLayerToggle[]>(INITIAL_LAYERS);

  useEffect(() => {
    fetchDistrictOptions()
      .then((rows) => {
        setDistrictOptions(rows);
        if (!rows.some((row) => row.district === DEFAULT_DISTRICT) && rows[0]) {
          setDistrict(rows[0].district);
          setDistrictQuery(rows[0].district);
          return;
        }
        setDistrictQuery(DEFAULT_DISTRICT);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    fetchSchools({ limit: 10000 })
      .then((rows) => setSchoolSearchOptions(rows))
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchSchools({ district, limit: 5000 })
      .then((rows) => {
        if (cancelled) return;
        setSchools(rows);
        setSelectedSchoolId((current) => current ?? rows[0]?.school_id ?? null);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [district]);

  useEffect(() => {
    if (!selectedSchoolId) {
      setSelectedSchoolDetail(null);
      return;
    }

    fetchSchoolDetail(selectedSchoolId)
      .then((detail) => setSelectedSchoolDetail(detail))
      .catch(() => setSelectedSchoolDetail(null));
  }, [selectedSchoolId]);

  const selectedSchool = useMemo(
    () => schools.find((school) => school.school_id === selectedSchoolId) ?? null,
    [schools, selectedSchoolId]
  );

  const selectedDistrictOption = useMemo(
    () => districtOptions.find((option) => option.district === district) ?? null,
    [districtOptions, district]
  );

  const selectedProvince = selectedDistrictOption?.province;

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

  const applyDistrict = (value: string) => {
    setDistrict(value);
    setDistrictQuery(value);
    setShowDistrictSuggestions(false);
  };

  const applySchool = (school: SchoolRecord) => {
    setSchoolQuery(school.school_name);
    setShowSchoolSuggestions(false);
    setDistrict(school.district);
    setDistrictQuery(school.district);
    setSelectedSchoolId(school.school_id ?? null);
  };

  const toggleLayer = (layerKey: SchoolLayerKey) => {
    setLayers((current) => {
      const isAirLayer = layerKey === "air_quality_mean" || layerKey === "air_quality_max";
      return current.map((layer) => {
        if (layer.key === layerKey) return { ...layer, active: !layer.active };
        if (!isAirLayer) return layer;
        if (layer.key === "air_quality_mean" || layer.key === "air_quality_max")
          return { ...layer, active: false };
        return layer;
      });
    });
  };

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
                applyDistrict(districtSuggestions[0].district);
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
                  onMouseDown={() => applyDistrict(option.district)}
                >
                  {option.district}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <ScoreLegend scoreField={scoreField} />
        {error ? <p className="overlay-copy" style={{ color: "var(--color-danger)" }}>{error}</p> : null}
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
            <div className="table-wrap" style={{ border: 0, borderRadius: 0, height: "100%" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>School</th>
                    <th>Pri</th>
                    <th>Need</th>
                  </tr>
                </thead>
                <tbody>
                  {schools.map((school) => (
                    <tr
                      className="data-row"
                      key={school.school_id ?? `${school.school_name}-${school.latitude}-${school.longitude}`}
                      data-selected={school.school_id === selectedSchoolId}
                      onClick={() => setSelectedSchoolId(school.school_id ?? null)}
                    >
                      <td>{school.rank_priority ?? "n/a"}</td>
                      <td className="school-name-cell">{school.school_name}</td>
                      <td>
                        <span className="score-pill" style={scoreToPillStyle(school.priority)}>
                          {school.priority != null ? (school.priority * 100).toFixed(1) : "n/a"}
                        </span>
                      </td>
                      <td>
                        <span className="score-pill" style={scoreToPillStyle(school.need)}>
                          {school.need != null ? (school.need * 100).toFixed(1) : "n/a"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
