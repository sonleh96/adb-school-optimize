"use client";

import { SCORE_LEGEND_STOPS } from "@/lib/color";

export function ScoreLegend({ scoreField }: { scoreField: "priority" | "need" }) {
  return (
    <>
      <p className="panel-subtitle">
        Marker color currently reflects the chosen score dimension: {scoreField === "priority" ? "Priority" : "Need"}.
      </p>
      <div className="legend legend-score">
        {SCORE_LEGEND_STOPS.map((stop) => (
          <span className="legend-score-item" key={stop.label}>
            <span className="legend-swatch" style={{ background: stop.color }} />
            <span className="small-copy">{stop.label}</span>
          </span>
        ))}
      </div>
    </>
  );
}
