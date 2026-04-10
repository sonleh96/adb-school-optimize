"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import { fetchDistrictChoropleth, fetchIndicators } from "@/lib/api";
import type { DistrictRecord } from "@/lib/types";

const DistrictMap = dynamic(() => import("@/components/DistrictMap").then((mod) => mod.DistrictMap), {
  ssr: false,
  loading: () => <div className="loading">Loading district map…</div>,
});

export function DistrictExplorer() {
  const [indicator, setIndicator] = useState("Average AQI");
  const [indicators, setIndicators] = useState<string[]>(["Average AQI"]);
  const [features, setFeatures] = useState<DistrictRecord[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<DistrictRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchIndicators()
      .then((result) => {
        setIndicators(result.items);
        setIndicator(result.default);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDistrictChoropleth({ indicator })
      .then((result) => {
        if (cancelled) return;
        setFeatures(result.features);
        setSelectedDistrict((current) => current ?? result.features[0] ?? null);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [indicator]);

  const metricSummary = useMemo(() => {
    const values = features
      .map((feature) => Number(feature[indicatorToField(indicator)]))
      .filter((value) => Number.isFinite(value));

    if (values.length === 0) return null;
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((sum, value) => sum + value, 0) / values.length,
    };
  }, [features, indicator]);

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">District Explorer</h2>
          <p className="panel-subtitle">
            Compare aggregated administrative indicators across district polygons. Default indicator
            is Average AQI.
          </p>
        </div>
        <div className="controls">
          <div className="control">
            <label htmlFor="indicator">Indicator</label>
            <select id="indicator" value={indicator} onChange={(event) => setIndicator(event.target.value)}>
              {indicators.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="panel-body">
        {error ? <div className="error">{error}</div> : null}
        <div className="split-layout">
          <div className="panel map-card">
            <div className="panel-body">
              <div className="map-frame">
                {loading ? (
                  <div className="loading">Loading choropleth…</div>
                ) : (
                  <DistrictMap
                    indicator={indicator}
                    features={features}
                    selectedDistrictId={selectedDistrict?.district_id ?? null}
                    onSelectDistrict={setSelectedDistrict}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">Indicator Summary</h3>
                <p className="panel-subtitle">Quick read on the current choropleth metric.</p>
              </div>
            </div>
            <div className="panel-body">
              {metricSummary ? (
                <div className="detail-grid">
                  <div className="detail-card">
                    <h4>Minimum</h4>
                    <p>{metricSummary.min.toFixed(2)}</p>
                  </div>
                  <div className="detail-card">
                    <h4>Average</h4>
                    <p>{metricSummary.avg.toFixed(2)}</p>
                  </div>
                  <div className="detail-card">
                    <h4>Maximum</h4>
                    <p>{metricSummary.max.toFixed(2)}</p>
                  </div>
                  <div className="detail-card">
                    <h4>Districts</h4>
                    <p>{features.length}</p>
                  </div>
                </div>
              ) : (
                <div className="empty">No values available for this indicator.</div>
              )}

              <div style={{ marginTop: 16 }}>
                {selectedDistrict ? (
                  <div className="detail-card">
                    <h3>{selectedDistrict.district}</h3>
                    <p>{selectedDistrict.province}</p>
                    <p style={{ marginTop: 10 }}>
                      <strong>{indicator}:</strong>{" "}
                      {String(selectedDistrict[indicatorToField(indicator)] ?? "n/a")}
                    </p>
                  </div>
                ) : (
                  <div className="empty">Select a district polygon to inspect it.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
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
