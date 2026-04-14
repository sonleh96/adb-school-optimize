"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import { fetchDistrictChoropleth, fetchIndicators } from "@/lib/api";
import { districtIndicatorColor, districtIndicatorField } from "@/lib/districtIndicatorPalette";
import type { DistrictRecord } from "@/lib/types";

const DistrictMap = dynamic(() => import("@/components/DistrictMap").then((mod) => mod.DistrictMap), {
  ssr: false,
  loading: () => <div className="loading">Loading district map…</div>,
});

export function DistrictExplorer() {
  const [indicator, setIndicator] = useState("Average AQI");
  const [distributionScheme, setDistributionScheme] = useState<"everyone" | "selected_group" | "on_screen">("everyone");
  const [indicators, setIndicators] = useState<string[]>(["Average AQI"]);
  const [features, setFeatures] = useState<DistrictRecord[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<DistrictRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const indicatorField = districtIndicatorField(indicator);

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

  const metricValues = useMemo(
    () =>
      features
        .map((feature) => Number(feature[indicatorField]))
        .filter((value) => Number.isFinite(value)),
    [features, indicatorField]
  );

  const metricSummary = useMemo(() => {
    const values = metricValues;

    if (values.length === 0) return null;
    return {
      avg: values.reduce((sum, value) => sum + value, 0) / values.length,
      count: values.length,
    };
  }, [metricValues]);

  const selectedValue = useMemo(() => {
    if (!selectedDistrict) return null;
    const value = Number(selectedDistrict[indicatorField]);
    return Number.isFinite(value) ? value : null;
  }, [selectedDistrict, indicatorField]);

  const distribution = useMemo(
    () => buildDistribution(metricValues, selectedValue),
    [metricValues, selectedValue]
  );

  return (
    <section className="panel district-explorer">
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

      <div className="panel-body district-explorer-body">
        {error ? <div className="error">{error}</div> : null}
        <div className="split-layout district-split-layout">
          <div className="panel map-card district-map-card">
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

          <div className="panel district-summary-card">
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
                    <h4>Average</h4>
                    <p>{metricSummary.avg.toFixed(2)}</p>
                  </div>
                  <div className="detail-card">
                    <h4>Districts</h4>
                    <p>{metricSummary.count}</p>
                  </div>
                </div>
              ) : (
                <div className="empty">No values available for this indicator.</div>
              )}

              {distribution ? (
                <div className="distribution-panel">
                  <p className="distribution-heading">Distribution</p>
                  <div className="distribution-bars" role="img" aria-label={`${indicator} distribution histogram`}>
                    {distribution.bins.map((bin, index) => {
                      const normalizedHeight = distribution.maxCount > 0 ? bin.count / distribution.maxCount : 0;
                      const isSelectedBin = distribution.selectedBinIndex === index;
                      const color = distributionColor(
                        indicator,
                        index / Math.max(1, distribution.bins.length - 1),
                        distributionScheme,
                        isSelectedBin
                      );
                      return (
                        <span
                          key={`${bin.start}-${bin.end}-${index}`}
                          className="distribution-bar"
                          style={{
                            height: `${Math.max(6, normalizedHeight * 72)}px`,
                            background: color,
                            opacity: distributionScheme === "on_screen" ? 0.9 : 1,
                          }}
                          title={`${bin.start.toFixed(2)} to ${bin.end.toFixed(2)}: ${bin.count}`}
                        />
                      );
                    })}
                  </div>
                  <div className="distribution-axis">
                    <span>{distribution.min.toFixed(2)}</span>
                    <span>{((distribution.min + distribution.max) / 2).toFixed(2)}</span>
                    <span>{distribution.max.toFixed(2)}</span>
                  </div>
                  <div className="distribution-scheme-row">
                    <span className="distribution-scheme-label">color scheme:</span>
                    <button
                      type="button"
                      className={`distribution-scheme-button ${distributionScheme === "everyone" ? "is-active" : ""}`}
                      onClick={() => setDistributionScheme("everyone")}
                    >
                      EVERYONE
                    </button>
                    <button
                      type="button"
                      className={`distribution-scheme-button ${distributionScheme === "selected_group" ? "is-active" : ""}`}
                      onClick={() => setDistributionScheme("selected_group")}
                    >
                      SELECTED GROUP
                    </button>
                    <button
                      type="button"
                      className={`distribution-scheme-button ${distributionScheme === "on_screen" ? "is-active" : ""}`}
                      onClick={() => setDistributionScheme("on_screen")}
                    >
                      ON SCREEN
                    </button>
                  </div>
                </div>
              ) : null}

              <div style={{ marginTop: 16 }}>
                {selectedDistrict ? (
                  <div className="detail-card">
                    <h3>{selectedDistrict.district}</h3>
                    <p>{selectedDistrict.province}</p>
                    <p style={{ marginTop: 10 }}>
                      <strong>{indicator}:</strong>{" "}
                      {String(selectedDistrict[indicatorField] ?? "n/a")}
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

type DistributionBin = { start: number; end: number; count: number };
type DistributionPayload = {
  bins: DistributionBin[];
  min: number;
  max: number;
  maxCount: number;
  selectedBinIndex: number | null;
};

function buildDistribution(values: number[], selectedValue: number | null): DistributionPayload | null {
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const binCount = Math.min(36, Math.max(14, Math.round(Math.sqrt(values.length) * 2)));

  if (max === min) {
    return {
      bins: [{ start: min, end: max, count: values.length }],
      min,
      max,
      maxCount: values.length,
      selectedBinIndex: selectedValue != null ? 0 : null,
    };
  }

  const width = (max - min) / binCount;
  const bins: DistributionBin[] = Array.from({ length: binCount }, (_, index) => ({
    start: min + index * width,
    end: min + (index + 1) * width,
    count: 0,
  }));

  for (const value of values) {
    const index = Math.min(binCount - 1, Math.floor((value - min) / width));
    bins[index].count += 1;
  }

  const selectedBinIndex =
    selectedValue == null ? null : Math.min(binCount - 1, Math.max(0, Math.floor((selectedValue - min) / width)));

  return {
    bins,
    min,
    max,
    maxCount: Math.max(...bins.map((bin) => bin.count)),
    selectedBinIndex,
  };
}

function distributionColor(
  indicator: string,
  position: number,
  scheme: "everyone" | "selected_group" | "on_screen",
  isSelectedBin: boolean
): string {
  const everyone = districtIndicatorColor(indicator, position);
  if (scheme === "selected_group") return isSelectedBin ? everyone : "#d7dddb";
  if (scheme === "on_screen") return everyone;
  return everyone;
}
