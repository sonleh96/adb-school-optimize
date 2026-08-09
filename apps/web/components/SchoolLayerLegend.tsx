"use client";

import type { SchoolLayerKey } from "@/components/SchoolMap";

export function SchoolLayerLegend({ layerKey }: { layerKey: SchoolLayerKey }) {
  if (layerKey === "roads") return <span className="school-layer-legend-line">Road segments</span>;

  if (layerKey === "air_quality_mean" || layerKey === "air_quality_max") {
    return (
      <div className="school-layer-legend school-layer-legend-aqi">
        <LegendColor color="#00E400" label="Good" />
        <LegendColor color="#FFFF00" label="Moderate" />
        <LegendColor color="#FF7E00" label="USG" />
        <LegendColor color="#FF0000" label="Unhealthy" />
        <LegendColor color="#8F3F97" label="Very unhealthy" />
        <LegendColor color="#7E0023" label="Hazardous" />
      </div>
    );
  }

  if (layerKey === "access_walk") return <AccessLegend within="#059669" outside="#c2410c" label="Walk" />;
  if (layerKey === "access_cycle") return <AccessLegend within="#0891b2" outside="#9a3412" label="Cycle" />;
  if (layerKey === "access_drive") return <AccessLegend within="#6366f1" outside="#be123c" label="Drive" />;

  if (layerKey === "flood")
    return <GradientLegend className="flood-gradient" label="Lower to higher flood signal" />;
  if (layerKey === "elevation") return <GradientLegend label="Lower to higher elevation" />;
  if (layerKey === "luminosity") return <GradientLegend label="Lower to higher nighttime luminosity" />;

  return (
    <div className="school-layer-legend school-layer-legend-landcover">
      <LegendColor color="#419bdf" label="Water" />
      <LegendColor color="#397d49" label="Trees" />
      <LegendColor color="#88b053" label="Grass" />
      <LegendColor color="#7a87c6" label="Flooded vegetation" />
      <LegendColor color="#e49635" label="Crops" />
      <LegendColor color="#dfc35a" label="Shrub" />
      <LegendColor color="#c4281b" label="Built-up" />
      <LegendColor color="#a59b8f" label="Bare" />
      <LegendColor color="#b39fe1" label="Snow / ice" />
    </div>
  );
}

function AccessLegend({ within, outside, label }: { within: string; outside: string; label: string }) {
  return (
    <div className="school-layer-legend">
      <LegendColor color={within} label={`${label} within`} />
      <LegendColor color={outside} label={`${label} outside`} />
    </div>
  );
}

function GradientLegend({ className = "grayscale-gradient", label }: { className?: string; label: string }) {
  return (
    <div className="school-layer-legend school-layer-legend-gradient">
      <span className={`legend-gradient ${className}`} />
      <span>{label}</span>
    </div>
  );
}

function LegendColor({ color, label }: { color: string; label: string }) {
  return (
    <span className="school-layer-legend-color">
      <span className="school-layer-legend-swatch" style={{ background: color }} />
      {label}
    </span>
  );
}
