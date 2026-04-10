"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import { fetchDistrictOptions, fetchSchoolDetail, fetchSchools, getApiBaseUrl } from "@/lib/api";
import { scoreToColor } from "@/lib/color";
import type { SchoolRecord } from "@/lib/types";
import type { SchoolLayerKey, SchoolLayerToggle } from "@/components/SchoolMap";

const SchoolMap = dynamic(() => import("@/components/SchoolMap").then((mod) => mod.SchoolMap), {
  ssr: false,
  loading: () => <div className="loading">Loading school map…</div>,
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
];

export function SchoolExplorer() {
  const [district, setDistrict] = useState(DEFAULT_DISTRICT);
  const [districtOptions, setDistrictOptions] = useState<Array<{ district_id: string; province: string; district: string }>>([]);
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
        }
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchSchools({ district, limit: 1000 })
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

  const toggleLayer = (layerKey: SchoolLayerKey) => {
    setLayers((current) => {
      const isAirLayer = layerKey === "air_quality_mean" || layerKey === "air_quality_max";
      return current.map((layer) => {
        if (layer.key === layerKey) return { ...layer, active: !layer.active };
        if (!isAirLayer) return layer;
        if (layer.key === "air_quality_mean" || layer.key === "air_quality_max") return { ...layer, active: false };
        return layer;
      });
    });
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">School Explorer</h2>
          <p className="panel-subtitle">
            Left: school map. Right: synced shortlist table. Default district is National Capital
            District and selection is single-select in v1.
          </p>
        </div>
        <div className="controls">
          <div className="control">
            <label htmlFor="district">District</label>
            <select id="district" value={district} onChange={(event) => setDistrict(event.target.value)}>
              {districtOptions.map((option) => (
                <option key={option.district_id} value={option.district}>
                  {option.district}
                </option>
              ))}
            </select>
          </div>
          <div className="control">
            <label htmlFor="school-color">Color markers by</label>
            <select
              id="school-color"
              value={scoreField}
              onChange={(event) => setScoreField(event.target.value as "priority" | "need")}
            >
              <option value="priority">Priority</option>
              <option value="need">Need</option>
            </select>
          </div>
          <div className="action-row">
            <a className="button button-secondary" href={`${getApiBaseUrl()}/api/v1/exports/ranked.csv`}>
              Download CSV
            </a>
            <a className="button button-secondary" href={`${getApiBaseUrl()}/api/v1/exports/ranked.xlsx`}>
              Download XLSX
            </a>
          </div>
        </div>
      </div>

      <div className="panel-body">
        {error ? <div className="error">{error}</div> : null}
        <div className="split-layout">
          <div className="panel map-card">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">Geospatial School View</h3>
                <p className="panel-subtitle">
                  Click a school marker to sync selection into the table and detail cards.
                </p>
              </div>
            </div>
            <div className="panel-body">
              <div className="map-frame">
                {loading ? (
                  <div className="loading">Loading schools…</div>
                ) : (
                  <SchoolMap
                    schools={schools}
                    selectedSchoolId={selectedSchoolId}
                    onSelectSchool={setSelectedSchoolId}
                    scoreField={scoreField}
                    district={district}
                    province={selectedProvince}
                    layers={layers}
                  />
                )}
              </div>
              <div className="layer-control-box">
                <p className="layer-control-title">Layer control</p>
                <label className="layer-control-item layer-control-item-fixed">
                  <input type="checkbox" checked disabled />
                  <span>Schools</span>
                </label>
                {layers.map((layer) => (
                  <label className="layer-control-item" key={layer.key}>
                    <input
                      type="checkbox"
                      checked={layer.active}
                      onChange={() => toggleLayer(layer.key)}
                    />
                    <span>{layer.label}</span>
                  </label>
                ))}
              </div>
              <p className="status-note">
                Layer overlays load from backend. Air Quality is exclusive between Average and
                Maximum AQI.
              </p>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">Ranked School Table</h3>
                <p className="panel-subtitle">
                  Current district slice with seeded default scenario scores.
                </p>
              </div>
            </div>
            <div className="panel-body">
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>School</th>
                      <th>District</th>
                      <th>Priority</th>
                      <th>Need</th>
                      <th>Rank</th>
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
                        <td>{school.school_name}</td>
                        <td>{school.district}</td>
                        <td>
                          <span
                            className="score-pill"
                            style={{ background: `${scoreToColor(school.priority)}20`, color: scoreToColor(school.priority) }}
                          >
                            {school.priority != null ? (school.priority * 100).toFixed(1) : "n/a"}
                          </span>
                        </td>
                        <td>{school.need != null ? (school.need * 100).toFixed(1) : "n/a"}</td>
                        <td>{school.rank_priority ?? "n/a"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="two-up" style={{ marginTop: 16 }}>
          <article className="panel">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">Selected School Snapshot</h3>
                <p className="panel-subtitle">Decision-ready summary for the current single selection.</p>
              </div>
            </div>
            <div className="panel-body">
              {selectedSchool ? (
                <div className="detail-grid">
                  <div className="detail-card">
                    <h4>{selectedSchool.school_name}</h4>
                    <p>{selectedSchool.district}, {selectedSchool.province}</p>
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
                <div className="empty">Pick a school on the map or in the table.</div>
              )}
            </div>
          </article>

          <article className="panel">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">Map Legend</h3>
                <p className="panel-subtitle">Marker color currently reflects the chosen score dimension.</p>
              </div>
            </div>
            <div className="panel-body">
              <div className="legend">
                <span className="legend-swatch" style={{ background: "#93c5fd" }} />
                <span className="small-copy">Low</span>
                <span className="legend-swatch" style={{ background: "#3b82f6" }} />
                <span className="small-copy">Moderate</span>
                <span className="legend-swatch" style={{ background: "#2563eb" }} />
                <span className="small-copy">High</span>
                <span className="legend-swatch" style={{ background: "#1d4ed8" }} />
                <span className="small-copy">Very high</span>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
