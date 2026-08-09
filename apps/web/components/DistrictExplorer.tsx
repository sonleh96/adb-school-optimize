"use client";

import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { fetchDistrictChoropleth, fetchIndicators } from "@/lib/api";
import { DistrictScoreLegend } from "@/components/DistrictScoreLegend";
import { getDistrictScore, getTopDistrictIds, sortDistrictsByScore } from "@/lib/districtScores";
import { districtIndicatorColor, districtIndicatorField } from "@/lib/districtIndicatorPalette";
import { queryKeys } from "@/lib/queryKeys";
import type { DistrictRecord } from "@/lib/types";

const DistrictMap = dynamic(() => import("@/components/DistrictMap").then((mod) => mod.DistrictMap), {
  ssr: false,
  loading: () => <div className="loading">Loading district map…</div>,
});

export function DistrictExplorer() {
  const [indicator, setIndicator] = useState("Average AQI");
  const [distributionScheme, setDistributionScheme] = useState<"everyone" | "selected_group">("everyone");
  const [selectedDistrict, setSelectedDistrict] = useState<DistrictRecord | null>(null);
  const [rankingScoreField, setRankingScoreField] = useState<"priority" | "need">("priority");
  const [topNEnabled, setTopNEnabled] = useState(true);
  const [topNCount, setTopNCount] = useState(10);
  const indicatorField = districtIndicatorField(indicator);

  const indicatorsQuery = useQuery({
    queryKey: queryKeys.indicators,
    queryFn: fetchIndicators,
  });

  const choroplethQuery = useQuery({
    queryKey: queryKeys.choropleth({ indicator, fields: "indicator" }),
    queryFn: () => fetchDistrictChoropleth({ indicator, fields: "indicator" }),
  });

  const indicators = useMemo(
    () => indicatorsQuery.data?.items ?? ["Average AQI"],
    [indicatorsQuery.data?.items],
  );
  const features = useMemo(
    () => choroplethQuery.data?.features ?? [],
    [choroplethQuery.data?.features],
  );
  const loading = choroplethQuery.isLoading;
  const error =
    (indicatorsQuery.error instanceof Error && indicatorsQuery.error.message) ||
    (choroplethQuery.error instanceof Error && choroplethQuery.error.message) ||
    null;

  useEffect(() => {
    if (indicatorsQuery.data?.default) {
      setIndicator(indicatorsQuery.data.default);
    }
  }, [indicatorsQuery.data?.default]);

  useEffect(() => {
    if (!features.length) return;
    setSelectedDistrict((current) => {
      if (!current) return features[0] ?? null;
      return features.find((feature) => feature.district_id === current.district_id) ?? features[0] ?? null;
    });
  }, [features]);

  const metricValues = useMemo(
    () =>
      features.map((feature) => Number(feature[indicatorField])).filter((value) => Number.isFinite(value)),
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

  const rankedDistricts = useMemo(
    () => sortDistrictsByScore(features, rankingScoreField),
    [features, rankingScoreField]
  );

  const highlightedDistrictIds = useMemo(
    () => (topNEnabled ? getTopDistrictIds(features, rankingScoreField, topNCount) : new Set<string>()),
    [features, rankingScoreField, topNCount, topNEnabled]
  );

  return (
    <div className="map-workspace">
      <div className="map-workspace-canvas">
        <div className="map-frame">
          {loading ? (
            <div className="loading absolute inset-0">Loading choropleth…</div>
          ) : (
            <DistrictMap
              indicator={indicator}
              features={features}
              selectedDistrictId={selectedDistrict?.district_id ?? null}
              onSelectDistrict={setSelectedDistrict}
              highlightedDistrictIds={highlightedDistrictIds}
              rankingScoreField={rankingScoreField}
              showIndicatorLayer={!topNEnabled}
            />
          )}
        </div>
      </div>

      <div className="map-overlay-controls map-overlay-controls-top-left">
        <p className="overlay-title">District explorer</p>
        <p className="overlay-copy">Compare administrative indicators across polygons.</p>
        <div className="control" style={{ minWidth: 0 }}>
          <label htmlFor="indicator">Indicator</label>
          <select id="indicator" value={indicator} onChange={(event) => setIndicator(event.target.value)}>
            {indicators.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="score-toggle" role="group" aria-label="Rank districts by">
          <button
            type="button"
            className={`score-toggle-button ${rankingScoreField === "priority" ? "is-active" : ""}`}
            onClick={() => setRankingScoreField("priority")}
          >
            Priority
          </button>
          <button
            type="button"
            className={`score-toggle-button ${rankingScoreField === "need" ? "is-active" : ""}`}
            onClick={() => setRankingScoreField("need")}
          >
            Need
          </button>
        </div>
        <div className="district-topn-toggle-row">
          <label className="district-topn-checkbox" htmlFor="top-n-enabled">
            <input
              id="top-n-enabled"
              type="checkbox"
              checked={topNEnabled}
              onChange={(event) => setTopNEnabled(event.target.checked)}
            />
            <span>Top-N</span>
          </label>
          <input
            className="district-topn-input"
            type="number"
            min={1}
            step={1}
            value={topNCount}
            onChange={(event) => setTopNCount(Math.max(1, Number(event.target.value) || 1))}
          />
        </div>
        {error ? <p className="overlay-copy" style={{ color: "var(--color-danger)" }}>{error}</p> : null}
      </div>

      <div className="map-overlay-legend">
        <div className="map-legend-block">
          <DistrictScoreLegend scoreField={rankingScoreField} />
        </div>
      </div>

      <aside className="map-side-panel" aria-label="District summary and ranking">
        <article className="float-panel map-side-panel-secondary">
          <div className="float-panel-head">
            <div>
              <h2 className="float-panel-title">Selection</h2>
              <p className="float-panel-subtitle">{indicator}</p>
            </div>
          </div>
          <div className="float-panel-body">
            {selectedDistrict ? (
              <div className="detail-card">
                <h3>{selectedDistrict.district}</h3>
                <p>{selectedDistrict.province}</p>
                <p style={{ marginTop: 8 }}>
                  <strong>{indicator}:</strong> {String(selectedDistrict[indicatorField] ?? "n/a")}
                </p>
              </div>
            ) : (
              <p className="overlay-copy">Select a district polygon.</p>
            )}
            {metricSummary ? (
              <div className="detail-grid" style={{ marginTop: 10 }}>
                <div className="detail-card">
                  <h4>Average</h4>
                  <p>{metricSummary.avg.toFixed(2)}</p>
                </div>
                <div className="detail-card">
                  <h4>Districts</h4>
                  <p>{metricSummary.count}</p>
                </div>
              </div>
            ) : null}
            {distribution ? (
              <div className="distribution-panel" style={{ marginTop: 10 }}>
                <p className="distribution-heading">Distribution</p>
                <div
                  className="distribution-bars"
                  role="img"
                  aria-label={`${indicator} distribution histogram`}
                >
                  {distribution.bins.map((bin, index) => {
                    const normalizedHeight =
                      distribution.maxCount > 0 ? bin.count / distribution.maxCount : 0;
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
                        }}
                        title={`${bin.start.toFixed(2)} to ${bin.end.toFixed(2)}: ${bin.count}`}
                      />
                    );
                  })}
                </div>
                <div className="distribution-scheme-row">
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
                </div>
              </div>
            ) : null}
          </div>
        </article>

        <article className="float-panel map-side-panel-primary">
          <div className="float-panel-head">
            <div>
              <h2 className="float-panel-title">District ranking</h2>
              <p className="float-panel-subtitle">
                Sorted by {rankingScoreField === "priority" ? "Priority" : "Need"}
              </p>
            </div>
          </div>
          <div className="float-panel-body" style={{ padding: 0 }}>
            <div className="table-wrap" style={{ border: 0, borderRadius: 0, height: "100%" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>District</th>
                    <th>Pri</th>
                    <th>Need</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedDistricts.map((feature, index) => {
                    const isHighlighted = highlightedDistrictIds.has(feature.district_id);
                    return (
                      <tr
                        className="data-row"
                        key={feature.district_id}
                        data-selected={feature.district_id === selectedDistrict?.district_id}
                        data-highlighted={isHighlighted}
                        onClick={() => setSelectedDistrict(feature)}
                      >
                        <td>
                          {getDistrictScore(feature, rankingScoreField) == null ? "n/a" : index + 1}
                        </td>
                        <td className="school-name-cell">{feature.district}</td>
                        <td>{formatDistrictScore(feature.priority)}</td>
                        <td>{formatDistrictScore(feature.need)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </article>
      </aside>
    </div>
  );
}

function formatDistrictScore(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return value.toFixed(3);
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
    selectedValue == null
      ? null
      : Math.min(binCount - 1, Math.max(0, Math.floor((selectedValue - min) / width)));

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
  scheme: "everyone" | "selected_group",
  isSelectedBin: boolean
): string {
  const everyone = districtIndicatorColor(indicator, position);
  if (scheme === "selected_group") return isSelectedBin ? everyone : "#d7dddb";
  return everyone;
}
