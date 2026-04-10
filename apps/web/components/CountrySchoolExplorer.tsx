"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import { fetchSchoolDetail, fetchSchools, getApiBaseUrl } from "@/lib/api";
import { scoreToPillStyle } from "@/lib/color";
import { ScoreLegend } from "@/components/ScoreLegend";
import type { SchoolRecord } from "@/lib/types";
import type { SchoolLayerToggle } from "@/components/SchoolMap";

const SchoolMap = dynamic(() => import("@/components/SchoolMap").then((mod) => mod.SchoolMap), {
  ssr: false,
  loading: () => <div className="loading">Loading school map…</div>,
});

const EMPTY_LAYERS: SchoolLayerToggle[] = [];

export function CountrySchoolExplorer() {
  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
  const [selectedSchoolDetail, setSelectedSchoolDetail] = useState<Record<string, unknown> | null>(null);
  const [scoreField, setScoreField] = useState<"priority" | "need">("priority");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchSchools({ limit: 10000 })
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
  }, []);

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

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">All Schools (Country View)</h2>
          <p className="panel-subtitle">
            National map view of all schools. Raster overlays are disabled in this tab.
          </p>
        </div>
        <div className="controls">
          <div className="control">
            <label htmlFor="national-school-color">Color markers by</label>
            <select
              id="national-school-color"
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
        <div className="split-layout split-layout-country">
          <div className="panel map-card">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">National School Map</h3>
                <p className="panel-subtitle">
                  Click a school marker to sync selection into the ranked table.
                </p>
                <div className="map-score-legend">
                  <ScoreLegend scoreField={scoreField} />
                </div>
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
                    district="All PNG"
                    layers={EMPTY_LAYERS}
                  />
                )}
              </div>
              <p className="status-note">No raster or vector overlay layers are enabled in this view.</p>
            </div>
          </div>

          <div className="sidebar-stack">
            <article className="panel">
              <div className="panel-head">
                <div>
                  <h3 className="panel-title">Ranked School Table</h3>
                  <p className="panel-subtitle">Nationwide table with Priority and Need scores.</p>
                </div>
              </div>
              <div className="panel-body">
                <div className="table-wrap table-wrap-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>School Name</th>
                        <th>Priority</th>
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

            <article className="panel">
              <div className="panel-head">
                <div>
                  <h3 className="panel-title">Selected School Snapshot</h3>
                  <p className="panel-subtitle">Current selection from national map or table.</p>
                </div>
              </div>
              <div className="panel-body">
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
                  <div className="empty">Pick a school on the map or in the table.</div>
                )}
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
