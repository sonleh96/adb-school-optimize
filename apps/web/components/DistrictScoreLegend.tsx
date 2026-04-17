"use client";

import { districtIndicatorColor } from "@/lib/districtIndicatorPalette";

export function DistrictScoreLegend({ scoreField }: { scoreField: "priority" | "need" }) {
  const indicatorName = scoreField === "priority" ? "Priority Score" : "Need Score";
  const swatches = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="district-choropleth-legend">
      <p className="panel-subtitle">
        District choropleth: {scoreField === "priority" ? "Priority" : "Need"} score
      </p>
      <div className="legend district-choropleth-legend-row">
        <span className="small-copy">Low</span>
        {swatches.map((stop) => (
          <span
            key={stop}
            className="district-choropleth-swatch"
            style={{ background: districtIndicatorColor(indicatorName, stop) }}
          />
        ))}
        <span className="small-copy">High</span>
      </div>
    </div>
  );
}
