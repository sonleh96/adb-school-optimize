"use client";

import { Search } from "lucide-react";
import { useId, useState } from "react";

import type { BoundCopy } from "@/lib/screening/copy";
import type { Method } from "@/lib/screening/copy/method";
import type { FilterOptions, Filters } from "@/lib/screening/filters";
import type { MapLayer } from "@/lib/screening/workspace/state";

import { FindFields, type FindPatch } from "../Find";
import base from "../screening.module.css";
import styles from "./method.module.css";

/**
 * The plain screen's province, district and name, then remoteness. Each change applies at once; the list and the map
 * keep every rank as it was.
 */
export function FilterPanel({
  copy,
  method,
  options,
  filters,
  onChange,
}: {
  copy: BoundCopy;
  method: Method;
  options: FilterOptions;
  filters: Pick<Filters, "prov" | "dist" | "q" | "loc">;
  onChange: (patch: FindPatch & { loc?: string | null }) => void;
}) {
  const { TERMS } = copy;
  const { loc } = filters;
  const { localities } = options;
  const ids = useId();
  return (
    <>
      <p className={base.eyebrow}>{TERMS.filters.label}</p>
      <FindFields copy={copy} options={options} value={filters} onChange={onChange} />
      <label className={styles.field} htmlFor={`${ids}-loc`}>
        <span>{TERMS.need_locality.label}</span>
        <select
          id={`${ids}-loc`}
          value={loc ?? ""}
          onChange={(event) => onChange({ loc: event.target.value || null })}
        >
          <option value="">{method.filter.allLocalities}</option>
          {localities.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <p className={base.popNote}>{TERMS.filters.help}</p>
    </>
  );
}

/** The layers the screen can draw: its school marks and their numbers, grouped and searchable. */
export function LayersPanel({
  copy,
  method,
  numerals,
  hidden,
  available,
  onToggle,
}: {
  copy: BoundCopy;
  method: Method;
  /** How many places carry their number on the map. */
  numerals: number;
  hidden: readonly MapLayer[];
  /** The layers this screen has data for. */
  available: readonly MapLayer[];
  onToggle: (layer: MapLayer) => void;
}) {
  const [query, setQuery] = useState("");
  const { TERMS } = copy;
  const name: Record<MapLayer, string> = {
    ranked: method.layers.items.ranked,
    numerals: method.layers.items.numerals(numerals),
    range: method.layers.items.range,
    queue: TERMS.queue.label,
    provinces: method.layers.items.provinces,
    districts: method.layers.items.districts,
  };
  const groups: { title: string; layers: MapLayer[] }[] = [
    { title: method.layers.groups.Schools, layers: ["ranked", "numerals", "range", "queue"] },
    { title: method.layers.groups.Boundaries, layers: ["provinces", "districts"] },
  ];
  const q = query.trim().toLowerCase();
  const shown = groups
    .map((g) => ({
      ...g,
      layers: g.layers.filter(
        (layer) =>
          available.includes(layer) &&
          (!q || name[layer].toLowerCase().includes(q) || g.title.toLowerCase().includes(q))
      ),
    }))
    .filter((g) => g.layers.length > 0);
  return (
    <>
      <p className={base.eyebrow}>{TERMS.layers.label}</p>
      <label className={styles.search}>
        <Search size={12} aria-hidden />
        <input
          type="search"
          placeholder={method.layers.find}
          aria-label={method.layers.find}
          value={query}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {shown.length === 0 ? <p className={styles.empty}>{method.layers.none}</p> : null}
      {shown.map((group) => (
        <fieldset key={group.title} className={styles.layerGroup}>
          <legend className={base.eyebrow}>{group.title}</legend>
          {group.layers.map((layer) => (
            <label key={layer} className={styles.layerItem}>
              <input type="checkbox" checked={!hidden.includes(layer)} onChange={() => onToggle(layer)} />
              <span className={styles.layerSwitch} aria-hidden />
              <span>{name[layer]}</span>
            </label>
          ))}
        </fieldset>
      ))}
      <p className={base.popNote}>{TERMS.layers.help}</p>
    </>
  );
}
