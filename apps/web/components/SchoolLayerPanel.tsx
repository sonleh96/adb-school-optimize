"use client";

import { Layers3, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { SchoolLayerLegend } from "@/components/SchoolLayerLegend";
import type { SchoolLayerKey, SchoolLayerToggle } from "@/components/SchoolMap";
import { Slider } from "@/components/ui/slider";
import { SCORE_LEGEND_STOPS } from "@/lib/color";

const LAYER_GROUPS: Array<{ title: string; keys: SchoolLayerKey[] }> = [
  { title: "Access", keys: ["roads", "access_walk", "access_cycle", "access_drive"] },
  {
    title: "Environment",
    keys: ["air_quality_mean", "air_quality_max", "flood", "landcover", "elevation", "luminosity"],
  },
];

export function SchoolLayerPanel({
  layers,
  scoreField,
  onToggleLayer,
  onSoloLayer,
  onOpacityChange,
}: {
  layers: SchoolLayerToggle[];
  scoreField: "priority" | "need";
  onToggleLayer: (layerKey: SchoolLayerKey) => void;
  onSoloLayer: (layerKey: SchoolLayerKey) => void;
  onOpacityChange: (layerKey: SchoolLayerKey, opacity: number) => void;
}) {
  const [query, setQuery] = useState("");
  const layersByKey = useMemo(() => new Map(layers.map((layer) => [layer.key, layer])), [layers]);
  const normalizedQuery = query.trim().toLowerCase();
  const showSchools = matchesLayer("Schools", normalizedQuery);
  const hasMatchingLayer = layers.some((layer) => matchesLayer(layer.label, normalizedQuery));

  return (
    <aside className="float-panel map-overlay-layers school-layer-panel" aria-label="Map layers">
      <div className="float-panel-head school-layer-panel-head">
        <div>
          <h2 className="float-panel-title">
            <Layers3 aria-hidden="true" size={16} /> Layers
          </h2>
          <p className="float-panel-subtitle">AQI mean and maximum are exclusive.</p>
        </div>
      </div>
      <div className="float-panel-body school-layer-panel-body">
        <label className="school-layer-search-label" htmlFor="layer-search">
          Search layers
        </label>
        <div className="school-layer-search">
          <Search aria-hidden="true" size={14} />
          <input
            id="layer-search"
            type="search"
            value={query}
            placeholder="Find a layer"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {showSchools ? (
          <section className="school-layer-group" aria-labelledby="school-layer-scores">
            <h3 id="school-layer-scores">Scores &amp; schools</h3>
            <div className="school-layer-static-row">
              <span className="school-layer-static-title">Schools</span>
              <span className="school-layer-static-note">
                Markers show {scoreField === "priority" ? "Priority" : "Need"}.
              </span>
              <div className="school-layer-score-stops" aria-label={`${scoreField} score color scale`}>
                {SCORE_LEGEND_STOPS.map((stop) => (
                  <span key={stop.label} style={{ background: stop.color }} title={stop.label} />
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {LAYER_GROUPS.map((group) => {
          const groupLayers = group.keys
            .map((key) => layersByKey.get(key))
            .filter((layer): layer is SchoolLayerToggle => Boolean(layer))
            .filter((layer) => matchesLayer(layer.label, normalizedQuery));
          if (!groupLayers.length) return null;

          return (
            <section
              className="school-layer-group"
              key={group.title}
              aria-labelledby={`school-layer-${group.title}`}
            >
              <h3 id={`school-layer-${group.title}`}>{group.title}</h3>
              {groupLayers.map((layer) => (
                <LayerItem
                  key={layer.key}
                  layer={layer}
                  onToggleLayer={onToggleLayer}
                  onSoloLayer={onSoloLayer}
                  onOpacityChange={onOpacityChange}
                />
              ))}
            </section>
          );
        })}

        {normalizedQuery && !showSchools && !hasMatchingLayer ? (
          <p className="school-layer-empty" role="status">
            No layers match this search.
          </p>
        ) : null}
      </div>
    </aside>
  );
}

function LayerItem({
  layer,
  onToggleLayer,
  onSoloLayer,
  onOpacityChange,
}: {
  layer: SchoolLayerToggle;
  onToggleLayer: (layerKey: SchoolLayerKey) => void;
  onSoloLayer: (layerKey: SchoolLayerKey) => void;
  onOpacityChange: (layerKey: SchoolLayerKey, opacity: number) => void;
}) {
  const inputId = `layer-${layer.key}`;
  const sliderId = `layer-opacity-${layer.key}`;
  const opacityPercent = Math.round(layer.opacity * 100);

  return (
    <div className="school-layer-item" data-active={layer.active}>
      <div className="school-layer-item-topline">
        <label className="school-layer-toggle" htmlFor={inputId}>
          <input
            id={inputId}
            type="checkbox"
            checked={layer.active}
            onChange={() => onToggleLayer(layer.key)}
          />
          <span>{layer.label}</span>
        </label>
        <button type="button" className="school-layer-solo" onClick={() => onSoloLayer(layer.key)}>
          Solo
        </button>
      </div>
      {layer.active ? <SchoolLayerLegend layerKey={layer.key} /> : null}
      <div className="school-layer-opacity">
        <label htmlFor={sliderId}>Opacity {opacityPercent}%</label>
        <Slider
          id={sliderId}
          min={0.1}
          max={1}
          step={0.05}
          value={[layer.opacity]}
          aria-label={`${layer.label} opacity`}
          onValueChange={(value) => onOpacityChange(layer.key, value[0] ?? layer.opacity)}
        />
      </div>
    </div>
  );
}

function matchesLayer(label: string, query: string): boolean {
  return !query || label.toLowerCase().includes(query);
}
