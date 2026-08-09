"use client";

export function CompareScoreLegend({ className = "" }: { className?: string }) {
  return (
    <div className={`compare-score-legend ${className}`.trim()} role="status" aria-live="polite">
      <p className="panel-subtitle">
        <strong>Priority + Need comparison</strong>
      </p>
      <div className="compare-score-legend-row">
        <span className="compare-score-marker-swatch" aria-hidden="true" />
        <span className="small-copy">Fill: Priority score. Ring: Need score.</span>
      </div>
      <p className="small-copy">
        Blue is lower and ochre is higher. A gray fill or ring means that score is unavailable.
      </p>
    </div>
  );
}
